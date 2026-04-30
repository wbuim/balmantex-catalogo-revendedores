require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
// Importamos também o 'Payment' da SDK do Mercado Pago
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
    dotfiles: 'deny',
    index: 'index.html',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store');
        }
    }
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    dotfiles: 'deny'
}));

// Bloqueia explicitamente tentativas de acesso a arquivos sensíveis
app.use((req, res, next) => {
    const url = decodeURIComponent(req.path || '').toLowerCase();

    const bloqueados = [
        '.env',
        'server.js',
        'package.json',
        'package-lock.json',
        'balmantex.db',
        '.git',
        'contexto',
        'backup',
        'backups',
        'private'
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

// NOVA TABELA: Histórico de Pedidos
db.run(`CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    items TEXT,
    total REAL,
    status TEXT,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(cliente_id) REFERENCES clientes(id)
)`);

// Garantia de colunas para bases já existentes ou instalações novas
db.run(`ALTER TABLE produtos ADD COLUMN estoque INTEGER DEFAULT 10`, (err) => {
    if (err && !String(err.message).includes('duplicate column name')) {
        console.error('Erro ao garantir coluna estoque:', err.message);
    }
});

db.run(`ALTER TABLE pedidos ADD COLUMN rastreio TEXT`, (err) => {
    if (err && !String(err.message).includes('duplicate column name')) {
        console.error('Erro ao garantir coluna rastreio:', err.message);
    }
});

const JWT_SECRET = process.env.JWT_SECRET;

// =======================================================
// MIDDLEWARE DE SEGURANÇA (O "Porteiro" do JWT)
// =======================================================
const verificaToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ error: "Token não fornecido." });
    
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Sessão expirada ou inválida. Faça login novamente." });
        req.clienteId = decoded.id; // Guarda o ID do cliente que fez a requisição
        next();
    });
};


// =======================================================
// SEGURANÇA DO PAINEL ADMIN
// =======================================================
const verificaTokenAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ error: "Token de administrador não fornecido." });
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err || decoded.role !== 'admin') return res.status(401).json({ error: "Acesso negado. Sessão inválida." });
        next();
    });
};

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
app.get('/api/produtos', (req, res) => {
    db.all(`SELECT * FROM produtos`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});


const salvarImagem = (base64) => {
    if (!base64 || !base64.startsWith('data:image')) return base64;
    const fs = require('fs');
    const path = require('path');
    const matches = base64.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
    if (!matches) return base64;
    const buffer = Buffer.from(matches[2], 'base64');
    const fileName = Date.now() + '_' + Math.random().toString(36).substring(7) + '.' + matches[1];
    fs.writeFileSync(path.join(__dirname, 'uploads', fileName), buffer);
    return '/uploads/' + fileName;
};

app.post('/api/produtos', verificaTokenAdmin, (req, res) => {
    const { name, category, size, price, desc, image, estoque } = req.body;
    const imagePath = salvarImagem(image);
    const sql = `INSERT INTO produtos (name, category, size, price, desc, image, estoque) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [name, category, size, price, desc, imagePath, estoque || 0], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID });
    });
});

app.put('/api/produtos/:id', verificaTokenAdmin, (req, res) => {
    const { name, category, size, price, desc, image, estoque } = req.body;
    const imagePath = salvarImagem(image);
    const sql = `UPDATE produtos SET name = ?, category = ?, size = ?, price = ?, desc = ?, image = ?, estoque = ? WHERE id = ?`;
    db.run(sql, [name, category, size, price, desc, imagePath, estoque || 0, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Produto atualizado" });
    });
});

app.delete('/api/produtos/:id', verificaTokenAdmin, (req, res) => {
    db.run(`DELETE FROM produtos WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Produto deletado" });
    });
});

// =======================================================
// ROTAS DE AUTENTICAÇÃO (CADASTRO E LOGIN)
// =======================================================
app.post('/api/cadastrar', (req, res) => {
    const { nome, email, senha, cpf_cnpj, telefone, cep, rua, numero, bairro, cidade, estado } = req.body;
    if (!nome || !email || !senha || !cpf_cnpj || !cep || !numero) {
        return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }
    const senhaHash = bcrypt.hashSync(senha, 10);
    const sql = `INSERT INTO clientes (nome, email, senha, cpf_cnpj, telefone, cep, rua, numero, bairro, cidade, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
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
// ROTAS DE PEDIDOS (NOVO!)
// =======================================================

// Buscar os pedidos do cliente logado
app.get('/api/meus-pedidos', verificaToken, (req, res) => {
    db.all(`SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY id DESC`, [req.clienteId], (err, rows) => {
        if (err) return res.status(500).json({ error: "Erro ao buscar pedidos." });
        res.json(rows);
    });
});

// =======================================================
// INTEGRAÇÃO MERCADO PAGO COM GERAÇÃO DE PEDIDO
// =======================================================
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

// Agora a rota tem o 'verificaToken' para garantir que sabemos quem está comprando
app.post('/create_preference', verificaToken, async (req, res) => {
    try {
        const cart = req.body; 
        const clienteId = req.clienteId; // Puxa do token descriptografado
        
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

        // 1. Salva o pedido no banco de dados ANTES de chamar o Mercado Pago
        const itemsString = JSON.stringify(cart);
        const sqlInsert = `INSERT INTO pedidos (cliente_id, items, total, status) VALUES (?, ?, ?, ?)`;
        
        db.run(sqlInsert, [clienteId, itemsString, total, 'Aguardando Pagamento'], async function(err) {
            if (err) return res.status(500).json({ error: "Erro ao registrar o pedido localmente." });
            
            const numeroDoPedido = this.lastID; // Pega o ID (ex: 1, 2, 3) que o SQLite gerou

            // 2. Cria a preferência de pagamento amarrada ao nosso Número de Pedido
            const preference = new Preference(client);
            const response = await preference.create({
                body: {
                    items: mpItems,
                    external_reference: numeroDoPedido.toString(), // A MÁGICA: Passamos o ID pra eles
                    back_urls: {
                        success: "https://balmantex.wcode.dev.br/",
                        failure: "https://balmantex.wcode.dev.br/",
                        pending: "https://balmantex.wcode.dev.br/"
                    },
                    auto_return: "approved",
                    notification_url: "https://balmantex.wcode.dev.br/webhook" // Nossa antena
                }
            });

            res.json({ init_point: response.init_point });
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao comunicar com Mercado Pago" });
    }
});

// =======================================================
// O WEBHOOK: A Antena que escuta o Mercado Pago
// =======================================================
app.post('/webhook', async (req, res) => {
    const { query, body } = req;
    
    // O MP manda um aviso de "pagamento"
    const topic = query.topic || query.type;
    
    if (topic === 'payment') {
        const paymentId = query['data.id'] || body.data.id;
        
        try {
            // Vai no Mercado Pago e pergunta: "De quem é esse pagamento e qual o status?"
            const payment = new Payment(client);
            const paymentInfo = await payment.get({ id: paymentId });

            const numeroDoPedido = paymentInfo.external_reference;
            const statusMP = paymentInfo.status; 

            // Traduz o status deles para o nosso sistema
            let statusBanco = 'Aguardando Pagamento';
            if (statusMP === 'approved') statusBanco = 'Pago e Confirmado';
            else if (statusMP === 'rejected') statusBanco = 'Pagamento Recusado';

            // Atualiza o banco de dados sem precisar de intervenção humana!
            db.run(`UPDATE pedidos SET status = ? WHERE id = ?`, [statusBanco, numeroDoPedido]);
            console.log(`[Webhook W-Code] Pedido #${numeroDoPedido} atualizado para: ${statusBanco}`);

        } catch (error) {
            console.error("Erro no Webhook:", error);
        }
    }
    
    // Temos que responder rápido com 200 OK pro Mercado Pago parar de enviar o aviso
    res.status(200).send("Recebido com sucesso.");
});

// =======================================================

// =======================================================
// NOVO: CHECKOUT TRANSPARENTE (BRICKS)
// =======================================================
app.post('/process_payment', verificaToken, async (req, res) => {
    const clienteId = req.clienteId;
    const { formData, cart, valorFrete } = req.body;
    let total = 0;
    cart.forEach(item => total += Number(item.price) * Number(item.quantity));
    total += Number(valorFrete || 0);
    const itemsString = JSON.stringify(cart);

    db.run('INSERT INTO pedidos (cliente_id, items, total, status) VALUES (?, ?, ?, ?)', [clienteId, itemsString, total, 'Aguardando Pagamento'], async function(err) {
        if (err) return res.status(500).json({ error: 'Erro ao registrar.' });
        const numPedido = this.lastID;
        try {
            const payment = new Payment(client);
            const response = await payment.create({
                body: { ...formData, external_reference: numPedido.toString() }
            });
            res.json({ status: response.status, status_detail: response.status_detail, id: response.id });
        } catch (error) {
            console.error("Erro MP:", error);
            res.status(500).json({ error: 'Erro na API do Mercado Pago' });
        }
    });
});


// =======================================================
// ROTAS EXCLUSIVAS DO PAINEL ADMIN (CLIENTES E PEDIDOS)
// =======================================================

// Buscar TODOS os pedidos (Para a tela do Admin)
app.get('/api/admin/pedidos', verificaTokenAdmin, (req, res) => {
    const sql = `
        SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone 
        FROM pedidos p 
        LEFT JOIN clientes c ON p.cliente_id = c.id 
        ORDER BY p.id DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Erro ao buscar pedidos no admin." });
        res.json(rows);
    });
});

// Buscar TODOS os clientes (Para a tela do Admin)

// Rota para o Admin atualizar o Rastreio
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

// ROTA FALLBACK ESTÁTICA
// =======================================================
app.use((req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(port, () => {
    console.log(`Servidor da Balmantex rodando na porta ${port}`);
});