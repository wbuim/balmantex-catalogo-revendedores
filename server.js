require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.disable('x-powered-by');
const port = 3002;

const allowedOrigins = [
    'https://balmantex.wcode.dev.br',
    'https://www.balmantex.wcode.dev.br',
    'http://localhost:3002',
    'http://127.0.0.1:3002'
];

app.use(cors({
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origem não permitida pelo CORS.'));
    }
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(express.static(PUBLIC_DIR, {
    etag: true,
    maxAge: '7d',
    setHeaders: (res, filePath) => {
        if (
            filePath.includes('admin.html') ||
            filePath.includes('login-cliente.html') ||
            filePath.includes('index.html')
        ) {
            res.setHeader('Cache-Control', 'no-cache');
            return;
        }
        if (/\.(css|js|png|jpg|jpeg|webp|gif|svg|ico|woff|woff2)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=604800');
        }
    }
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    dotfiles: 'deny'
}));

app.use((req, res, next) => {
    const url = decodeURIComponent(req.path || '').toLowerCase();
    const bloqueados = [
        '.env', 'server.js', 'package.json', 'package-lock.json',
        'balmantex.db', '.git', 'contexto', 'backup', 'backups', 'private'
    ];
    if (bloqueados.some(item => url.includes(item))) {
        return res.status(404).send('Arquivo não encontrado.');
    }
    next();
});


// =======================================================
// INICIALIZAÇÃO DO BANCO DE DADOS (SQLite)
// =======================================================
const db = new sqlite3.Database('./balmantex.db', (err) => {
    if (err) console.error("Erro ao abrir banco de dados:", err.message);
    else console.log("Conectado ao banco de dados SQLite (balmantex.db).");
});

db.run(`CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT, email TEXT UNIQUE, senha TEXT,
    cpf_cnpj TEXT, telefone TEXT, cep TEXT, rua TEXT,
    numero TEXT, bairro TEXT, cidade TEXT, estado TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, category TEXT, size TEXT, price REAL,
    desc TEXT, image TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    items TEXT,
    total REAL,
    status TEXT,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(cliente_id) REFERENCES clientes(id)
)`);


db.run(`CREATE TABLE IF NOT EXISTS movimentos_estoque (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    quantidade REAL NOT NULL DEFAULT 0,
    estoque_anterior REAL DEFAULT 0,
    estoque_novo REAL DEFAULT 0,
    reservado_anterior REAL DEFAULT 0,
    reservado_novo REAL DEFAULT 0,
    motivo TEXT,
    referencia_tipo TEXT,
    referencia_id TEXT,
    usuario TEXT,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(produto_id) REFERENCES produtos(id)
)`);

db.run(`CREATE INDEX IF NOT EXISTS idx_movimentos_estoque_produto_id ON movimentos_estoque(produto_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_movimentos_estoque_data ON movimentos_estoque(data_criacao)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_movimentos_estoque_tipo ON movimentos_estoque(tipo)`);

// Garante colunas em bases já existentes
const colunasGarantidas = [
    [`ALTER TABLE produtos ADD COLUMN estoque INTEGER DEFAULT 0`, 'estoque'],
    [`ALTER TABLE produtos ADD COLUMN estoque_reservado INTEGER DEFAULT 0`, 'estoque_reservado'],
    [`ALTER TABLE produtos ADD COLUMN peso REAL DEFAULT 0`, 'peso'],
    [`ALTER TABLE produtos ADD COLUMN volume REAL DEFAULT 0`, 'volume'],
    [`ALTER TABLE pedidos ADD COLUMN rastreio TEXT`, 'rastreio'],
];

colunasGarantidas.forEach(([sql, col]) => {
    db.run(sql, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error(`Erro ao garantir coluna ${col}:`, err.message);
        }
    });
});

const JWT_SECRET = process.env.JWT_SECRET;
const WHATSAPP_VENDAS = process.env.WHATSAPP_VENDAS || '5544999345231';

// =======================================================
// MIDDLEWARES DE AUTENTICAÇÃO
// =======================================================
const verificaToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ error: "Token não fornecido." });
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Sessão expirada ou inválida. Faça login novamente." });
        req.clienteId = decoded.id;
        next();
    });
};

const verificaTokenAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ error: "Token de administrador não fornecido." });
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err || decoded.role !== 'admin') return res.status(401).json({ error: "Acesso negado. Sessão inválida." });
        next();
    });
};

// =======================================================
// HELPERS DE ESTOQUE
// =======================================================

// Reserva estoque para cada item do carrinho dentro de uma transação
// Retorna uma Promise que resolve com true (ok) ou rejeita com mensagem de erro
function reservarEstoque(db, itens) {
    return new Promise((resolve, reject) => {
        const agregados = new Map();

        itens.forEach(item => {
            const id = Number(item.id);
            const qtd = Number(item.quantity || item.quantidade || 0);
            if (id > 0 && qtd > 0) {
                agregados.set(id, (agregados.get(id) || 0) + qtd);
            }
        });

        const ids = Array.from(agregados.keys());

        if (ids.length === 0) {
            return reject('Carrinho vazio ou inválido.');
        }

        const placeholders = ids.map(() => '?').join(',');

        db.serialize(() => {
            db.run('BEGIN IMMEDIATE TRANSACTION');

            db.all(
                `SELECT id, name, estoque, estoque_reservado,
                        (estoque - estoque_reservado) AS disponivel
                 FROM produtos
                 WHERE id IN (${placeholders})`,
                ids,
                (err, produtos) => {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err.message);
                    }

                    const problemas = [];

                    ids.forEach(id => {
                        const produto = produtos.find(p => Number(p.id) === Number(id));
                        const qtd = agregados.get(id);

                        if (!produto) {
                            problemas.push(`Produto ID ${id} não encontrado.`);
                        } else if (Number(produto.disponivel || 0) < qtd) {
                            problemas.push(`Estoque insuficiente para "${produto.name}". Disponível: ${produto.disponivel}, solicitado: ${qtd}.`);
                        }
                    });

                    if (problemas.length) {
                        db.run('ROLLBACK');
                        return reject(problemas[0]);
                    }

                    let pendentes = produtos.length;
                    let erroFinal = null;

                    produtos.forEach(produto => {
                        const qtd = agregados.get(Number(produto.id));
                        const estoqueAnterior = Number(produto.estoque || 0);
                        const reservadoAnterior = Number(produto.estoque_reservado || 0);
                        const reservadoNovo = reservadoAnterior + qtd;

                        db.run(
                            `UPDATE produtos SET estoque_reservado = ? WHERE id = ?`,
                            [reservadoNovo, produto.id],
                            (errUpd) => {
                                if (errUpd) erroFinal = errUpd;

                                registrarMovimentoEstoque({
                                    produto_id: produto.id,
                                    tipo: 'reserva',
                                    quantidade: qtd,
                                    estoque_anterior: estoqueAnterior,
                                    estoque_novo: estoqueAnterior,
                                    reservado_anterior: reservadoAnterior,
                                    reservado_novo: reservadoNovo,
                                    motivo: 'Reserva criada durante início de checkout.',
                                    referencia_tipo: 'checkout',
                                    referencia_id: null,
                                    usuario: 'sistema'
                                }, () => {
                                    pendentes--;

                                    if (pendentes === 0) {
                                        if (erroFinal) {
                                            db.run('ROLLBACK');
                                            return reject(erroFinal.message);
                                        }

                                        db.run('COMMIT');
                                        resolve(true);
                                    }
                                });
                            }
                        );
                    });
                }
            );
        });
    });
}

// Confirma a baixa definitiva (chamado no webhook quando pagamento aprovado)
function confirmarBaixaEstoque(db, itens, referenciaId = null) {
    itens.forEach(item => {
        const produtoId = Number(item.id);
        const qtd = Number(item.quantity || item.quantidade || 0);

        if (!produtoId || qtd <= 0) return;

        db.get(
            `SELECT id, estoque, estoque_reservado FROM produtos WHERE id = ?`,
            [produtoId],
            (err, produto) => {
                if (err || !produto) return;

                const estoqueAnterior = Number(produto.estoque || 0);
                const reservadoAnterior = Number(produto.estoque_reservado || 0);
                const estoqueNovo = Math.max(0, estoqueAnterior - qtd);
                const reservadoNovo = Math.max(0, reservadoAnterior - qtd);

                db.run(
                    `UPDATE produtos
                     SET estoque = ?,
                         estoque_reservado = ?
                     WHERE id = ?`,
                    [estoqueNovo, reservadoNovo, produtoId],
                    () => {
                        registrarMovimentoEstoque({
                            produto_id: produtoId,
                            tipo: 'venda_confirmada',
                            quantidade: qtd,
                            estoque_anterior: estoqueAnterior,
                            estoque_novo: estoqueNovo,
                            reservado_anterior: reservadoAnterior,
                            reservado_novo: reservadoNovo,
                            motivo: 'Baixa automática por pagamento aprovado.',
                            referencia_tipo: 'pedido',
                            referencia_id: referenciaId,
                            usuario: 'sistema'
                        });
                    }
                );
            }
        );
    });
}

// Libera a reserva (chamado quando pagamento é recusado ou expirado)
function liberarReservaEstoque(db, itens, referenciaId = null) {
    itens.forEach(item => {
        const produtoId = Number(item.id);
        const qtd = Number(item.quantity || item.quantidade || 0);

        if (!produtoId || qtd <= 0) return;

        db.get(
            `SELECT id, estoque, estoque_reservado FROM produtos WHERE id = ?`,
            [produtoId],
            (err, produto) => {
                if (err || !produto) return;

                const estoqueAnterior = Number(produto.estoque || 0);
                const reservadoAnterior = Number(produto.estoque_reservado || 0);
                const reservadoNovo = Math.max(0, reservadoAnterior - qtd);

                db.run(
                    `UPDATE produtos
                     SET estoque_reservado = ?
                     WHERE id = ?`,
                    [reservadoNovo, produtoId],
                    () => {
                        registrarMovimentoEstoque({
                            produto_id: produtoId,
                            tipo: 'liberacao_reserva',
                            quantidade: qtd,
                            estoque_anterior: estoqueAnterior,
                            estoque_novo: estoqueAnterior,
                            reservado_anterior: reservadoAnterior,
                            reservado_novo: reservadoNovo,
                            motivo: 'Reserva liberada por cancelamento, recusa ou erro.',
                            referencia_tipo: 'pedido',
                            referencia_id: referenciaId,
                            usuario: 'sistema'
                        });
                    }
                );
            }
        );
    });
}



// =======================================================
// HELPERS SQLITE PROMISE
// =======================================================
function dbGetAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    });
}

function dbAllAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
    });
}

function dbRunAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function moedaBR(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function limparNumeroWhatsApp(numero) {
    const limpo = String(numero || '').replace(/\D/g, '');
    if (!limpo) return '';
    if (limpo.startsWith('55')) return limpo;
    return '55' + limpo;
}



// =======================================================
// HELPERS DE MOVIMENTAÇÃO DE ESTOQUE
// =======================================================
function registrarMovimentoEstoque(dados, callback = () => {}) {
    const sql = `
        INSERT INTO movimentos_estoque (
            produto_id,
            tipo,
            quantidade,
            estoque_anterior,
            estoque_novo,
            reservado_anterior,
            reservado_novo,
            motivo,
            referencia_tipo,
            referencia_id,
            usuario
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
        dados.produto_id,
        dados.tipo,
        Number(dados.quantidade || 0),
        Number(dados.estoque_anterior || 0),
        Number(dados.estoque_novo || 0),
        Number(dados.reservado_anterior || 0),
        Number(dados.reservado_novo || 0),
        dados.motivo || null,
        dados.referencia_tipo || null,
        dados.referencia_id || null,
        dados.usuario || 'sistema'
    ], (err) => {
        if (err) {
            console.error('[Movimento Estoque] Erro ao registrar movimento:', err.message);
        }
        callback(err);
    });
}

function atualizarEstoqueFisicoComMovimento(produtoId, novoEstoque, tipo, motivo, referenciaTipo, referenciaId, usuario, callback) {
    db.get(
        `SELECT id, name, estoque, estoque_reservado FROM produtos WHERE id = ?`,
        [produtoId],
        (err, produto) => {
            if (err) return callback(err);
            if (!produto) return callback(new Error('Produto não encontrado.'));

            const estoqueAnterior = Number(produto.estoque || 0);
            const reservadoAnterior = Number(produto.estoque_reservado || 0);
            const estoqueFinal = Number(novoEstoque || 0);

            if (estoqueFinal < 0) {
                return callback(new Error('O estoque não pode ficar negativo.'));
            }

            db.run(
                `UPDATE produtos SET estoque = ? WHERE id = ?`,
                [estoqueFinal, produtoId],
                function(errUpd) {
                    if (errUpd) return callback(errUpd);

                    registrarMovimentoEstoque({
                        produto_id: produtoId,
                        tipo,
                        quantidade: Math.abs(estoqueFinal - estoqueAnterior),
                        estoque_anterior: estoqueAnterior,
                        estoque_novo: estoqueFinal,
                        reservado_anterior: reservadoAnterior,
                        reservado_novo: reservadoAnterior,
                        motivo,
                        referencia_tipo: referenciaTipo,
                        referencia_id: referenciaId,
                        usuario
                    }, () => callback(null, {
                        produto_id: produtoId,
                        estoque_anterior: estoqueAnterior,
                        estoque_novo: estoqueFinal
                    }));
                }
            );
        }
    );
}


// =======================================================
// LOGIN ADMIN
// =======================================================
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
        res.json({ token });
    } else {
        res.status(401).json({ error: "Credenciais inválidas" });
    }
});


// =======================================================
// ROTAS DA VITRINE (PRODUTOS)
// =======================================================

// Retorna estoque_disponivel calculado para o frontend poder exibir
app.get('/api/produtos', (req, res) => {
    const somenteComFoto = String(req.query.somenteComFoto || '').toLowerCase();

    let sql = `SELECT *, (estoque - estoque_reservado) AS estoque_disponivel FROM produtos`;
    const params = [];

    // Usado pela vitrine pública para não exibir cards sem foto.
    // O admin continua chamando /api/produtos sem esse filtro e vê todos os itens.
    if (['1', 'true', 'sim', 'yes'].includes(somenteComFoto)) {
        sql += ` WHERE image IS NOT NULL AND TRIM(image) != ''`;
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

const salvarImagem = (base64) => {
    if (!base64 || !base64.startsWith('data:image')) return base64;
    const fs = require('fs');
    const matches = base64.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
    if (!matches) return base64;
    const buffer = Buffer.from(matches[2], 'base64');
    const fileName = Date.now() + '_' + Math.random().toString(36).substring(7) + '.' + matches[1];
    fs.writeFileSync(path.join(__dirname, 'uploads', fileName), buffer);
    return '/uploads/' + fileName;
};

// Cadastrar produto — agora aceita peso e volume
app.post('/api/produtos', verificaTokenAdmin, (req, res) => {
    const { name, category, size, price, desc, image, estoque, peso, volume } = req.body;
    const imagePath = salvarImagem(image);
    const estoqueInicial = Number(estoque || 0);

    const sql = `INSERT INTO produtos (name, category, size, price, desc, image, estoque, estoque_reservado, peso, volume)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`;

    db.run(sql, [name, category, size, price, desc, imagePath, estoqueInicial, peso || 0, volume || 0], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        const produtoId = this.lastID;

        if (estoqueInicial > 0) {
            registrarMovimentoEstoque({
                produto_id: produtoId,
                tipo: 'entrada_inicial',
                quantidade: estoqueInicial,
                estoque_anterior: 0,
                estoque_novo: estoqueInicial,
                reservado_anterior: 0,
                reservado_novo: 0,
                motivo: 'Estoque inicial informado no cadastro do produto.',
                referencia_tipo: 'produto',
                referencia_id: produtoId,
                usuario: 'admin'
            });
        }

        res.status(201).json({ id: produtoId });
    });
});

// Editar produto — agora aceita peso e volume
app.put('/api/produtos/:id', verificaTokenAdmin, (req, res) => {
    const { name, category, size, price, desc, image, estoque, peso, volume } = req.body;
    const produtoId = req.params.id;

    db.get(`SELECT id, estoque, estoque_reservado FROM produtos WHERE id = ?`, [produtoId], (errBusca, produtoAnterior) => {
        if (errBusca) return res.status(500).json({ error: errBusca.message });
        if (!produtoAnterior) return res.status(404).json({ error: 'Produto não encontrado.' });

        const estoqueAnterior = Number(produtoAnterior.estoque || 0);
        const reservadoAnterior = Number(produtoAnterior.estoque_reservado || 0);
        const estoqueNovo = Number(estoque || 0);
        const imagePath = salvarImagem(image);

        const sql = `UPDATE produtos
                     SET name = ?, category = ?, size = ?, price = ?, desc = ?,
                         image = ?, estoque = ?, peso = ?, volume = ?
                     WHERE id = ?`;

        db.run(sql, [name, category, size, price, desc, imagePath, estoqueNovo, peso || 0, volume || 0, produtoId], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            if (estoqueNovo !== estoqueAnterior) {
                registrarMovimentoEstoque({
                    produto_id: produtoId,
                    tipo: 'ajuste_edicao',
                    quantidade: Math.abs(estoqueNovo - estoqueAnterior),
                    estoque_anterior: estoqueAnterior,
                    estoque_novo: estoqueNovo,
                    reservado_anterior: reservadoAnterior,
                    reservado_novo: reservadoAnterior,
                    motivo: 'Estoque alterado durante edição completa do produto.',
                    referencia_tipo: 'produto',
                    referencia_id: produtoId,
                    usuario: 'admin'
                });
            }

            res.json({ message: "Produto atualizado" });
        });
    });
});

app.delete('/api/produtos/:id', verificaTokenAdmin, (req, res) => {
    db.run(`DELETE FROM produtos WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Produto deletado" });
    });
});

// Rota de consulta de estoque disponível (útil para o frontend validar antes do checkout)
app.post('/api/estoque/verificar', (req, res) => {
    const itens = req.body; // [{ id, quantity }]
    if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ error: 'Envie um array de itens.' });
    }

    const placeholders = itens.map(() => '?').join(',');
    const ids = itens.map(i => i.id);

    db.all(
        `SELECT id, name, estoque, estoque_reservado,
                (estoque - estoque_reservado) AS disponivel
         FROM produtos WHERE id IN (${placeholders})`,
        ids,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            const problemas = [];
            itens.forEach(item => {
                const prod = rows.find(r => r.id === item.id);
                if (!prod) {
                    problemas.push({ id: item.id, erro: 'Produto não encontrado.' });
                } else if (prod.disponivel < item.quantity) {
                    problemas.push({
                        id: item.id,
                        name: prod.name,
                        solicitado: item.quantity,
                        disponivel: prod.disponivel,
                        erro: `Estoque insuficiente para "${prod.name}". Disponível: ${prod.disponivel}.`
                    });
                }
            });

            if (problemas.length > 0) {
                return res.status(409).json({ ok: false, problemas });
            }
            res.json({ ok: true });
        }
    );
});


// =======================================================
// ROTAS DE AUTENTICAÇÃO
// =======================================================
app.post('/api/cadastrar', (req, res) => {
    const { nome, email, senha, cpf_cnpj, telefone, cep, rua, numero, bairro, cidade, estado } = req.body;
    if (!nome || !email || !senha || !cpf_cnpj || !cep || !numero) {
        return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }
    const senhaHash = bcrypt.hashSync(senha, 10);
    const sql = `INSERT INTO clientes (nome, email, senha, cpf_cnpj, telefone, cep, rua, numero, bairro, cidade, estado)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [nome, email, senhaHash, cpf_cnpj, telefone, cep, rua, numero, bairro, cidade, estado], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: "Este email já está cadastrado." });
            return res.status(500).json({ error: "Erro interno no banco de dados." });
        }
        res.status(201).json({ message: "Cadastro realizado com sucesso!" });
    });
});

app.post('/api/login', (req, res) => {
    const { email, senha } = req.body;
    db.get(`SELECT * FROM clientes WHERE email = ?`, [email], (err, cliente) => {
        if (err) return res.status(500).json({ error: "Erro interno." });
        if (!cliente || !bcrypt.compareSync(senha, cliente.senha)) {
            return res.status(401).json({ error: "Email ou senha incorretos." });
        }
        const token = jwt.sign({ id: cliente.id, nome: cliente.nome }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ message: "Login aprovado", token, nome: cliente.nome });
    });
});


// =======================================================
// ROTAS DE PEDIDOS
// =======================================================
app.get('/api/meus-pedidos', verificaToken, (req, res) => {
    db.all(`SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY id DESC`, [req.clienteId], (err, rows) => {
        if (err) return res.status(500).json({ error: "Erro ao buscar pedidos." });
        res.json(rows);
    });
});



// =======================================================
// PEDIDO VIA WHATSAPP - REGISTRA PEDIDO E REDIRECIONA
// =======================================================
app.post('/api/pedidos/whatsapp', verificaToken, async (req, res) => {
    try {
        const clienteId = req.clienteId;
        const { cart, valorFrete } = req.body;

        if (!Array.isArray(cart) || cart.length === 0) {
            return res.status(400).json({ error: 'Carrinho vazio ou inválido.' });
        }

        const qtdPorId = new Map();

        for (const item of cart) {
            const id = Number(item.id);
            const qtd = Number(item.quantity || item.quantidade || 0);

            if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(qtd) || qtd <= 0) {
                return res.status(400).json({ error: 'Item inválido no carrinho.' });
            }

            qtdPorId.set(id, (qtdPorId.get(id) || 0) + qtd);
        }

        const ids = Array.from(qtdPorId.keys());
        const placeholders = ids.map(() => '?').join(',');

        const produtos = await dbAllAsync(
            `SELECT id, name, category, size, price, image, estoque, estoque_reservado, peso, volume,
                    (estoque - estoque_reservado) AS estoque_disponivel
             FROM produtos
             WHERE id IN (${placeholders})`,
            ids
        );

        const problemas = [];

        for (const id of ids) {
            const produto = produtos.find(p => Number(p.id) === Number(id));
            const qtd = qtdPorId.get(id);

            if (!produto) {
                problemas.push({ id, erro: 'Produto não encontrado.' });
                continue;
            }

            if (Number(produto.estoque_disponivel || 0) < qtd) {
                problemas.push({
                    id,
                    name: produto.name,
                    solicitado: qtd,
                    disponivel: produto.estoque_disponivel,
                    erro: `Estoque insuficiente para "${produto.name}".`
                });
            }
        }

        if (problemas.length > 0) {
            return res.status(409).json({ ok: false, problemas });
        }

        const itensNormalizados = produtos.map(produto => {
            const qtd = qtdPorId.get(Number(produto.id));
            return {
                id: produto.id,
                name: produto.name,
                category: produto.category,
                size: produto.size,
                price: Number(produto.price || 0),
                quantity: qtd,
                image: produto.image,
                peso: Number(produto.peso || 0),
                volume: Number(produto.volume || 0)
            };
        });

        const subtotal = itensNormalizados.reduce((acc, item) => {
            return acc + (Number(item.price || 0) * Number(item.quantity || 0));
        }, 0);

        const frete = Number(valorFrete || 0);
        const total = subtotal + frete;

        const pedido = await dbRunAsync(
            `INSERT INTO pedidos (cliente_id, items, total, status) VALUES (?, ?, ?, ?)`,
            [clienteId, JSON.stringify(itensNormalizados), total, 'Pedido via WhatsApp']
        );

        const numeroPedido = pedido.lastID;

        const cliente = await dbGetAsync(
            `SELECT nome, email, cpf_cnpj, telefone, cep, rua, numero, bairro, cidade, estado
             FROM clientes
             WHERE id = ?`,
            [clienteId]
        );

        const pesoTotal = itensNormalizados.reduce((acc, item) => acc + (Number(item.peso || 0) * Number(item.quantity || 0)), 0);
        const volumeTotal = itensNormalizados.reduce((acc, item) => acc + (Number(item.volume || 0) * Number(item.quantity || 0)), 0);

        const linhasItens = itensNormalizados.map((item, index) => {
            const linhaTotal = Number(item.price || 0) * Number(item.quantity || 0);
            return `${index + 1}. ${item.name}
   Categoria: ${item.category || '-'}
   Tamanho: ${item.size || '-'}
   Quantidade: ${item.quantity}
   Valor unitário: ${moedaBR(item.price)}
   Total do item: ${moedaBR(linhaTotal)}`;
        }).join('\n\n');

        const endereco = cliente
            ? `${cliente.rua || ''}, ${cliente.numero || ''} - ${cliente.bairro || ''}, ${cliente.cidade || ''}/${cliente.estado || ''} - CEP: ${cliente.cep || ''}`
            : 'Não informado';

        const mensagem = `Olá, Balmantex! Gostaria de finalizar este pedido pelo WhatsApp.

Pedido nº: ${numeroPedido}

DADOS DO CLIENTE
Nome: ${cliente?.nome || '-'}
Telefone: ${cliente?.telefone || '-'}
E-mail: ${cliente?.email || '-'}
CPF/CNPJ: ${cliente?.cpf_cnpj || '-'}

ENDEREÇO DE ENTREGA
${endereco}

PRODUTOS
${linhasItens}

RESUMO
Subtotal: ${moedaBR(subtotal)}
Frete estimado: ${moedaBR(frete)}
Total estimado: ${moedaBR(total)}
Peso estimado: ${pesoTotal.toFixed(3).replace('.', ',')} kg
Volume estimado: ${volumeTotal.toFixed(3).replace('.', ',')} m³

Por favor, confirme disponibilidade, frete e forma de pagamento.`;

        const whatsappUrl = `https://wa.me/${limparNumeroWhatsApp(WHATSAPP_VENDAS)}?text=${encodeURIComponent(mensagem)}`;

        res.status(201).json({
            ok: true,
            pedido_id: numeroPedido,
            status: 'Pedido via WhatsApp',
            whatsapp_url: whatsappUrl
        });

    } catch (error) {
        console.error('Erro ao criar pedido via WhatsApp:', error);
        res.status(500).json({ error: 'Erro ao criar pedido via WhatsApp.' });
    }
});


// =======================================================
// MERCADO PAGO — PREFERÊNCIA (REDIRECT)
// =======================================================
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

app.post('/create_preference', verificaToken, async (req, res) => {
    try {
        const cart = req.body;
        const clienteId = req.clienteId;

        // 1. Verifica e reserva estoque
        try {
            await reservarEstoque(db, cart);
        } catch (erroEstoque) {
            return res.status(409).json({ error: erroEstoque });
        }

        let total = 0;
        const mpItems = cart.map(item => {
            total += Number(item.price) * Number(item.quantity);
            return {
                title: item.name,
                unit_price: Number(item.price),
                quantity: Number(item.quantity),
                currency_id: 'BRL'
            };
        });

        // 2. Salva o pedido
        const itemsString = JSON.stringify(cart);
        db.run(
            `INSERT INTO pedidos (cliente_id, items, total, status) VALUES (?, ?, ?, ?)`,
            [clienteId, itemsString, total, 'Aguardando Pagamento'],
            async function(err) {
                if (err) {
                    liberarReservaEstoque(db, cart, numPedido || null);
                    return res.status(500).json({ error: "Erro ao registrar o pedido localmente." });
                }

                const numeroDoPedido = this.lastID;

                // 3. Cria preferência no MP
                const preference = new Preference(client);
                const response = await preference.create({
                    body: {
                        items: mpItems,
                        external_reference: numeroDoPedido.toString(),
                        back_urls: {
                            success: "https://balmantex.wcode.dev.br/",
                            failure: "https://balmantex.wcode.dev.br/",
                            pending: "https://balmantex.wcode.dev.br/"
                        },
                        auto_return: "approved",
                        notification_url: "https://balmantex.wcode.dev.br/webhook"
                    }
                });

                res.json({ init_point: response.init_point });
            }
        );

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao comunicar com Mercado Pago" });
    }
});


// =======================================================
// WEBHOOK — ATUALIZA ESTOQUE CONFORME STATUS DO PAGAMENTO
// =======================================================
app.post('/webhook', async (req, res) => {
    const { query, body } = req;
    const topic = query.topic || query.type;

    if (topic === 'payment') {
        const paymentId = query['data.id'] || body.data.id;

        try {
            const payment = new Payment(client);
            const paymentInfo = await payment.get({ id: paymentId });

            const numeroDoPedido = paymentInfo.external_reference;
            const statusMP = paymentInfo.status;

            let statusBanco = 'Aguardando Pagamento';
            if (statusMP === 'approved') statusBanco = 'Pago e Confirmado';
            else if (statusMP === 'rejected') statusBanco = 'Pagamento Recusado';
            else if (statusMP === 'cancelled') statusBanco = 'Cancelado';

            db.run(`UPDATE pedidos SET status = ? WHERE id = ?`, [statusBanco, numeroDoPedido]);

            // Busca os itens do pedido para atualizar o estoque
            db.get(`SELECT items FROM pedidos WHERE id = ?`, [numeroDoPedido], (err, pedido) => {
                if (err || !pedido) return;
                const itens = JSON.parse(pedido.items);

                if (statusMP === 'approved') {
                    // Pagamento aprovado: confirma a baixa definitiva
                    confirmarBaixaEstoque(db, itens, numeroDoPedido);
                    console.log(`[Webhook] Pedido #${numeroDoPedido} APROVADO — estoque baixado.`);
                } else if (['rejected', 'cancelled'].includes(statusMP)) {
                    // Pagamento recusado ou cancelado: devolve a reserva
                    liberarReservaEstoque(db, itens, numeroDoPedido);
                    console.log(`[Webhook] Pedido #${numeroDoPedido} ${statusBanco.toUpperCase()} — reserva liberada.`);
                }
            });

        } catch (error) {
            console.error("Erro no Webhook:", error);
        }
    }

    res.status(200).send("Recebido com sucesso.");
});


// =======================================================
// CHECKOUT TRANSPARENTE (BRICKS)
// =======================================================
app.post('/process_payment', verificaToken, async (req, res) => {
    const clienteId = req.clienteId;
    const { formData, cart, valorFrete } = req.body;

    // 1. Verifica e reserva estoque
    try {
        await reservarEstoque(db, cart);
    } catch (erroEstoque) {
        return res.status(409).json({ error: erroEstoque });
    }

    let total = 0;
    cart.forEach(item => total += Number(item.price) * Number(item.quantity));
    total += Number(valorFrete || 0);
    const itemsString = JSON.stringify(cart);

    db.run(
        'INSERT INTO pedidos (cliente_id, items, total, status) VALUES (?, ?, ?, ?)',
        [clienteId, itemsString, total, 'Aguardando Pagamento'],
        async function(err) {
            if (err) {
                liberarReservaEstoque(db, cart, numPedido || null);
                return res.status(500).json({ error: 'Erro ao registrar.' });
            }
            const numPedido = this.lastID;
            try {
                const payment = new Payment(client);
                const response = await payment.create({
                    body: { ...formData, external_reference: numPedido.toString() }
                });

                // Se o pagamento já saiu aprovado na criação (ex: Pix confirmado na hora)
                if (response.status === 'approved') {
                    confirmarBaixaEstoque(db, cart, numPedido);
                    db.run(`UPDATE pedidos SET status = 'Pago e Confirmado' WHERE id = ?`, [numPedido]);
                }

                res.json({ status: response.status, status_detail: response.status_detail, id: response.id });
            } catch (error) {
                liberarReservaEstoque(db, cart, numPedido || null);
                console.error("Erro MP:", error);
                res.status(500).json({ error: 'Erro na API do Mercado Pago' });
            }
        }
    );
});


// =======================================================
// PAINEL ADMIN — PEDIDOS E CLIENTES
// =======================================================
app.get('/api/admin/pedidos', verificaTokenAdmin, (req, res) => {
    const sql = `
        SELECT
            p.*,
            c.nome as cliente_nome,
            c.email as cliente_email,
            c.cpf_cnpj as cliente_cpf_cnpj,
            c.telefone as cliente_telefone,
            c.cep as cliente_cep,
            c.rua as cliente_rua,
            c.numero as cliente_numero,
            c.bairro as cliente_bairro,
            c.cidade as cliente_cidade,
            c.estado as cliente_estado
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        ORDER BY p.id DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Erro ao buscar pedidos no admin." });
        res.json(rows);
    });
});

app.put('/api/admin/pedidos/:id/rastreio', verificaTokenAdmin, (req, res) => {
    const { rastreio } = req.body;
    db.run("UPDATE pedidos SET status = 'Enviado', rastreio = ? WHERE id = ?", [rastreio, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: "Erro ao atualizar envio." });
        res.json({ message: "Rastreio salvo com sucesso!" });
    });
});

app.get('/api/admin/clientes', verificaTokenAdmin, (req, res) => {
    db.all('SELECT id, nome, email, telefone, cidade, estado FROM clientes ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Erro ao buscar clientes." });
        res.json(rows);
    });
});

// Rota admin para ajuste manual de estoque
app.put('/api/admin/produtos/:id/estoque', verificaTokenAdmin, (req, res) => {
    const { estoque } = req.body;
    const novoEstoque = Number(estoque);

    if (!Number.isFinite(novoEstoque) || novoEstoque < 0) {
        return res.status(400).json({ error: 'Valor de estoque inválido.' });
    }

    atualizarEstoqueFisicoComMovimento(
        req.params.id,
        novoEstoque,
        'ajuste_manual',
        'Ajuste manual realizado no Estoque Completo.',
        'admin_estoque',
        req.params.id,
        'admin',
        (err, movimento) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                message: 'Estoque atualizado com sucesso.',
                movimento
            });
        }
    );
});




app.get('/api/admin/estoque/movimentos', verificaTokenAdmin, (req, res) => {
    const produtoId = req.query.produto_id ? Number(req.query.produto_id) : null;
    const limite = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);

    let sql = `
        SELECT
            m.*,
            p.name AS produto_nome,
            p.category AS produto_categoria,
            p.size AS produto_tamanho
        FROM movimentos_estoque m
        LEFT JOIN produtos p ON p.id = m.produto_id
    `;

    const params = [];

    if (produtoId) {
        sql += ` WHERE m.produto_id = ?`;
        params.push(produtoId);
    }

    sql += ` ORDER BY m.id DESC LIMIT ?`;
    params.push(limite);

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar movimentos de estoque.' });
        res.json(rows);
    });
});


// =======================================================
// RELATÓRIOS ADMIN — VENDAS, CLIENTES E ESTOQUE PARADO
// =======================================================
app.get('/api/admin/relatorios', verificaTokenAdmin, (req, res) => {
    const sqlPedidos = `
        SELECT
            p.*,
            c.nome as cliente_nome,
            c.email as cliente_email,
            c.telefone as cliente_telefone,
            c.cidade as cliente_cidade,
            c.estado as cliente_estado
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        ORDER BY p.id DESC
    `;

    const sqlProdutos = `
        SELECT
            *,
            (estoque - estoque_reservado) AS estoque_disponivel
        FROM produtos
        ORDER BY name ASC
    `;

    db.all(sqlPedidos, [], (errPedidos, pedidos) => {
        if (errPedidos) {
            return res.status(500).json({ error: 'Erro ao buscar pedidos para relatórios.' });
        }

        db.all(sqlProdutos, [], (errProdutos, produtos) => {
            if (errProdutos) {
                return res.status(500).json({ error: 'Erro ao buscar produtos para relatórios.' });
            }

            const produtosMap = new Map();
            produtos.forEach(p => produtosMap.set(Number(p.id), p));

            const produtosVendidos = new Map();
            const clientes = new Map();

            let receitaTotal = 0;
            let unidadesVendidas = 0;
            let pedidosConsiderados = 0;

            const statusIgnorados = ['cancelado', 'pagamento recusado', 'recusado'];

            pedidos.forEach(pedido => {
                const status = String(pedido.status || '').toLowerCase();
                const ignorar = statusIgnorados.some(s => status.includes(s));
                if (ignorar) return;

                let itens = [];
                try {
                    itens = JSON.parse(pedido.items || '[]');
                    if (!Array.isArray(itens)) itens = [];
                } catch (e) {
                    itens = [];
                }

                if (!itens.length) return;

                pedidosConsiderados++;

                const dataPedido = pedido.data_criacao || null;
                const totalPedido = Number(pedido.total || 0);
                receitaTotal += totalPedido;

                const clienteId = Number(pedido.cliente_id || 0);
                const clienteKey = clienteId || `sem-id-${pedido.cliente_nome || pedido.id}`;

                if (!clientes.has(clienteKey)) {
                    clientes.set(clienteKey, {
                        cliente_id: clienteId || null,
                        nome: pedido.cliente_nome || 'Cliente não identificado',
                        email: pedido.cliente_email || '',
                        telefone: pedido.cliente_telefone || '',
                        cidade: pedido.cliente_cidade || '',
                        estado: pedido.cliente_estado || '',
                        pedidos: 0,
                        total: 0,
                        unidades: 0,
                        ultima_compra: null
                    });
                }

                const cli = clientes.get(clienteKey);
                cli.pedidos += 1;
                cli.total += totalPedido;
                if (!cli.ultima_compra || String(dataPedido || '') > String(cli.ultima_compra || '')) {
                    cli.ultima_compra = dataPedido;
                }

                itens.forEach(item => {
                    const id = Number(item.id || item.produto_id || 0);
                    const qtd = Number(item.quantity || item.quantidade || 0);
                    const preco = Number(item.price || item.preco || 0);
                    const totalItem = qtd * preco;

                    if (!qtd) return;

                    unidadesVendidas += qtd;
                    cli.unidades += qtd;

                    const produtoBanco = produtosMap.get(id);
                    const key = id || `sem-id-${item.name || item.nome || 'produto'}`;

                    if (!produtosVendidos.has(key)) {
                        produtosVendidos.set(key, {
                            id: id || null,
                            name: item.name || item.nome || produtoBanco?.name || 'Produto sem nome',
                            category: item.category || produtoBanco?.category || '',
                            size: item.size || produtoBanco?.size || '',
                            quantidade: 0,
                            receita: 0,
                            pedidos: 0,
                            ultima_venda: null,
                            estoque: Number(produtoBanco?.estoque || 0),
                            estoque_reservado: Number(produtoBanco?.estoque_reservado || 0),
                            estoque_disponivel: Number(produtoBanco?.estoque_disponivel || 0)
                        });
                    }

                    const prod = produtosVendidos.get(key);
                    prod.quantidade += qtd;
                    prod.receita += totalItem;
                    prod.pedidos += 1;

                    if (!prod.ultima_venda || String(dataPedido || '') > String(prod.ultima_venda || '')) {
                        prod.ultima_venda = dataPedido;
                    }
                });
            });

            const produtosMaisVendidos = Array.from(produtosVendidos.values())
                .sort((a, b) => {
                    if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
                    return b.receita - a.receita;
                })
                .slice(0, 30);

            const clientesMaisCompram = Array.from(clientes.values())
                .sort((a, b) => {
                    if (b.total !== a.total) return b.total - a.total;
                    return b.pedidos - a.pedidos;
                })
                .slice(0, 30);

            const vendidosPorId = new Map();
            Array.from(produtosVendidos.values()).forEach(p => {
                if (p.id) vendidosPorId.set(Number(p.id), p);
            });

            const produtosParados = produtos
                .map(produto => {
                    const vendido = vendidosPorId.get(Number(produto.id));
                    const estoque = Number(produto.estoque || 0);
                    const reservado = Number(produto.estoque_reservado || 0);
                    const disponivel = Number(produto.estoque_disponivel || 0);
                    const preco = Number(produto.price || 0);

                    return {
                        id: produto.id,
                        name: produto.name,
                        category: produto.category,
                        size: produto.size,
                        price: preco,
                        estoque,
                        estoque_reservado: reservado,
                        estoque_disponivel: disponivel,
                        valor_parado: disponivel * preco,
                        quantidade_vendida: vendido?.quantidade || 0,
                        ultima_venda: vendido?.ultima_venda || null,
                        status_parado: vendido ? 'Já vendido' : 'Nunca vendido'
                    };
                })
                .filter(p => Number(p.estoque_disponivel || 0) > 0)
                .sort((a, b) => {
                    if (!a.ultima_venda && b.ultima_venda) return -1;
                    if (a.ultima_venda && !b.ultima_venda) return 1;
                    if (!a.ultima_venda && !b.ultima_venda) return b.valor_parado - a.valor_parado;
                    return String(a.ultima_venda).localeCompare(String(b.ultima_venda));
                })
                .slice(0, 50);

            const resumo = {
                pedidos_considerados: pedidosConsiderados,
                receita_total: receitaTotal,
                unidades_vendidas: unidadesVendidas,
                clientes_com_pedidos: clientes.size,
                produtos_cadastrados: produtos.length,
                produtos_com_estoque: produtos.filter(p => Number(p.estoque_disponivel || 0) > 0).length,
                valor_total_estoque_disponivel: produtos.reduce((acc, p) => acc + (Number(p.estoque_disponivel || 0) * Number(p.price || 0)), 0)
            };

            res.json({
                resumo,
                produtosMaisVendidos,
                clientesMaisCompram,
                produtosParados
            });
        });
    });
});


// =======================================================
// FALLBACK
// =======================================================
app.use((req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(port, () => {
    console.log(`Servidor da Balmantex rodando na porta ${port}`);
});