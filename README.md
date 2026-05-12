# Balmantex — Catálogo Comercial para Revendedores

Catálogo digital voltado para vendas B2B com revendedores: vitrine de produtos, área administrativa, controle de estoque e direcionamento de pedidos via WhatsApp.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?logo=javascript&logoColor=black)
![HTML](https://img.shields.io/badge/HTML5-markup-E34F26?logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-style-1572B6?logo=css3&logoColor=white)
![MercadoPago](https://img.shields.io/badge/MercadoPago-API-009EE3?logo=mercadopago&logoColor=white)

---

## Descrição

Sistema web comercial desenvolvido para a Balmantex, empresa fabricante de tecidos jacquard e tear. O catálogo digital permite que revendedores visualizem produtos organizados por categoria, consultem preços e disponibilidade, e encaminhem pedidos diretamente via WhatsApp — sem necessidade de cadastro. A área administrativa controla o catálogo, o estoque e acompanha os pedidos.

---

## Visão Geral

A aplicação é construída com Express 5 servindo páginas HTML estáticas e uma API REST em JSON. A autenticação da área administrativa usa JWT. O banco de dados SQLite armazena produtos, categorias, estoque e pedidos. A integração com MercadoPago permite geração de links de pagamento. CORS configurado para aceitar apenas origens autorizadas. Cache de arquivos estáticos via Express com headers de controle.

---

## Funcionalidades Principais

- **Catálogo digital** — Vitrine de produtos com fotos, descrição, preço e disponibilidade
- **Página inicial focada em revendedores** — Hero section, apresentação da fábrica e call-to-action para pedidos
- **Organização de produtos** — Categorias, filtros e destaque para produtos com foto
- **Controle de estoque** — Movimentações de entrada/saída, histórico e alertas
- **Área administrativa** — CRUD completo de produtos, categorias, revendedores e pedidos
- **Direcionamento via WhatsApp** — Pedido montado no catálogo e enviado direto para o WhatsApp da empresa
- **Histórico de pedidos** — Registro e acompanhamento dos pedidos recebidos
- **Integração MercadoPago** — Geração de link de pagamento para facilitar a cobrança

---

## Principais Telas / Views

| Arquivo | Rota | Descrição |
|---|---|---|
| `index.html` | `/` | Página inicial — catálogo público para revendedores |
| `admin.html` | `/admin.html` | Painel administrativo — produtos, estoque e pedidos |
| `login-cliente.html` | `/login-cliente.html` | Acesso para área de cliente/revendedor |

> O frontend é servido como HTML estático por Express, com a lógica no lado do cliente via `script.js` consumindo a API REST do `server.js`.

---

## Screenshots Planejados

> As capturas de tela serão adicionadas após aprovação do portfólio.

```
docs/screenshots/home.png
docs/screenshots/catalogo.png
docs/screenshots/produto.png
docs/screenshots/admin.png
docs/screenshots/whatsapp.png
```

---

## Estrutura do Projeto

```
balman/
├── server.js                # Servidor principal — API REST e configuração Express
├── .env.example             # Variáveis de ambiente (modelo)
├── public/
│   ├── index.html           # Catálogo público
│   ├── admin.html           # Painel administrativo
│   ├── login-cliente.html   # Login de clientes
│   ├── script.js            # Lógica do frontend (fetch API, carrinho, WhatsApp)
│   ├── style.css            # Estilos globais
│   ├── balmantex-logo.png   # Logo
│   ├── fundo-hero.jpg       # Imagem de fundo do hero
│   ├── whatsapp-icon.svg    # Ícone WhatsApp
│   ├── site-images/         # Imagens do site (não versionadas)
│   └── uploads/             # Fotos de produtos (não versionadas)
└── balmantex.db             # Banco SQLite (não versionado)
```

**API REST (server.js):**

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/produtos` | Lista produtos do catálogo |
| `GET` | `/api/categorias` | Lista categorias |
| `POST` | `/api/pedidos` | Registra pedido |
| `POST` | `/api/admin/login` | Autenticação JWT |
| `POST/PUT/DELETE` | `/api/admin/produtos` | CRUD de produtos |
| `GET/POST` | `/api/admin/estoque` | Controle de estoque |
| `GET` | `/api/admin/pedidos` | Listagem de pedidos |

---

## Como Executar Localmente

```bash
# 1. Clone o repositório
git clone <url-do-repositorio>
cd balman

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Edite .env com seus valores (JWT_SECRET, MP_ACCESS_TOKEN, etc.)

# 4. Inicie o servidor
npm start
```

Acesse em: `http://localhost:3002`

> **Requisito mínimo:** Node.js 18+  
> O banco de dados SQLite é criado automaticamente na primeira execução.

---

## Segurança e Dados Sensíveis

Este repositório **não contém e não deve conter**:

- Arquivo `.env` com senhas, JWT secret ou token do MercadoPago
- Banco de dados `balmantex.db` com dados reais de produtos ou pedidos
- Imagens de produtos na pasta `public/uploads/`
- Imagens do site em `public/site-images/`

Use `.env.example` como referência. O banco é criado automaticamente na primeira execução com estrutura vazia.

---

## Status

`Em produção` — Projeto desenvolvido para uso real em empresa fabricante de tecidos, apresentado como portfólio profissional.

---

## Autor

Desenvolvido por **Wanderley Muzati Buim Neto**

- GitHub: [github.com/wbuim](https://github.com/wbuim)
- LinkedIn: [linkedin.com/in/neto-buim-0a1698297](https://linkedin.com/in/neto-buim-0a1698297)
