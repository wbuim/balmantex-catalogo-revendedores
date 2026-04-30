// ==========================================
// SISTEMA DE MODAL CUSTOMIZADO
// ==========================================
window.showModal = function(title, message, type = 'info', onConfirm = null) {
    const existing = document.getElementById('custom-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'custom-modal-overlay';
    overlay.className = 'custom-modal-overlay';

    let icon = type === 'warning' ? '⚠️' : type === 'error' ? '❌' : '✅';
    let btnText = onConfirm ? 'Confirmar' : 'Entendi';
    let cancelBtn = onConfirm ? `<button class="btn-modal btn-modal-cancel">Cancelar</button>` : '';

    overlay.innerHTML = `
        <div class="custom-modal">
            <div class="custom-modal-header">
                <span>${icon}</span>
                <h3>${title}</h3>
            </div>
            <div class="custom-modal-body">
                <p>${message}</p>
            </div>
            <div class="custom-modal-footer">
                ${cancelBtn}
                <button class="btn-modal btn-modal-confirm">${btnText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Pequeno delay para a animação do CSS funcionar
    setTimeout(() => overlay.classList.add('active'), 10);

    const closeModal = () => {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    };

    overlay.querySelector('.btn-modal-confirm').addEventListener('click', () => {
        closeModal();
        if (onConfirm) onConfirm();
    });

    if (onConfirm) {
        overlay.querySelector('.btn-modal-cancel').addEventListener('click', closeModal);
    }
};

// ==========================================
// 2. LÓGICA DO CARRINHO DE COMPRAS
// ==========================================
let cart = JSON.parse(localStorage.getItem('balmantex_cart')) || [];

const cartIcon = document.getElementById('cart-icon');
const cartOverlay = document.getElementById('cart-overlay');
const cartSidebar = document.getElementById('cart-sidebar');
const closeCartBtn = document.getElementById('close-cart');
const cartItemsContainer = document.getElementById('cart-items');
const cartCount = document.getElementById('cart-count');
const cartTotalPrice = document.getElementById('cart-total-price');
const btnCheckout = document.getElementById('btn-checkout');

// Abrir/Fechar Carrinho
function toggleCart() {
    if (cartSidebar && cartOverlay) {
        cartSidebar.classList.toggle('active');
        cartOverlay.classList.toggle('active');
    }
}

if (cartIcon) cartIcon.addEventListener('click', (e) => { e.preventDefault(); toggleCart(); });
if (closeCartBtn) closeCartBtn.addEventListener('click', toggleCart);
if (cartOverlay) cartOverlay.addEventListener('click', toggleCart);


// --- Lógica de Frete Fixado ---
window.valorFreteAtual = 0;
const btnFrete = document.getElementById('btn-calcular-frete');
const inputCepFrete = document.getElementById('cep-frete');
const msgFrete = document.getElementById('msg-frete');

if(btnFrete) {
    btnFrete.addEventListener('click', async () => {
        const cep = inputCepFrete.value.replace(/\D/g, '');
        if(cep.length !== 8) {
            msgFrete.textContent = 'Por favor, insira um CEP válido com 8 dígitos.';
            msgFrete.style.color = '#e74c3c';
            return;
        }
        msgFrete.textContent = 'A consultar os Correios...';
        msgFrete.style.color = '#7A7A7A';
        try {
            const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            const data = await res.json();
            if(data.erro) throw new Error();
            
            const uf = data.uf.toUpperCase();
            
            // ======= TABELA DE PREÇOS DE FRETE =======
            // Altere os valores aqui quando falar com o seu gestor
            if(uf === 'PR') {
                window.valorFreteAtual = 15.00;
            } else if(['RS','SC','SP','RJ','MG','ES'].includes(uf)) {
                window.valorFreteAtual = 25.00;
            } else {
                window.valorFreteAtual = 40.00;
            }
            // =========================================
            
            msgFrete.textContent = `Frete para ${data.localidade}/${uf}: R$ ${window.valorFreteAtual.toFixed(2).replace('.', ',')}`;
            msgFrete.style.color = 'var(--whatsapp-green)';
            updateCartUI(); // Recalcula o subtotal + frete
        } catch(e) {
            msgFrete.textContent = 'CEP não encontrado.';
            msgFrete.style.color = '#e74c3c';
        }
    });
}

// Atualizar Interface do Carrinho
function updateCartUI() {
    if (!cartItemsContainer) return;
    
    cartItemsContainer.innerHTML = '';
    let total = 0;

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p style="text-align:center; color:#7A7A7A; margin-top:20px;">Seu carrinho está vazio.</p>';
        if (cartCount) cartCount.textContent = '0';
        if (document.getElementById('cart-subtotal-price')) document.getElementById('cart-subtotal-price').textContent = 'R$ 0,00';
        if (cartTotalPrice) cartTotalPrice.textContent = 'R$ 0,00';
        window.valorFreteAtual = 0;
        if(document.getElementById('msg-frete')) document.getElementById('msg-frete').textContent = '';
        if(document.getElementById('cep-frete')) document.getElementById('cep-frete').value = '';
        if (btnCheckout) {
            btnCheckout.disabled = true;
            btnCheckout.style.opacity = '0.5';
        }
        return;
    }

    if (btnCheckout) {
        btnCheckout.disabled = false;
        btnCheckout.style.opacity = '1';
    }

    cart.forEach((item, index) => {
        total += parseFloat(item.price) * item.quantity;
        
        const itemElement = document.createElement('div');
        itemElement.className = 'cart-item';
        itemElement.innerHTML = `
            <img src="${item.image}" alt="${item.name}">
            <div class="cart-item-info">
                <h4>${item.name}</h4>
                <p>Qtd: ${item.quantity}</p>
                <div class="cart-item-price">R$ ${(parseFloat(item.price) * item.quantity).toFixed(2).replace('.', ',')}</div>
                <button class="remove-item" onclick="removeFromCart(${index})">Remover</button>
            </div>
        `;
        cartItemsContainer.appendChild(itemElement);
    });

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (cartCount) cartCount.textContent = totalItems;
    if (document.getElementById('cart-subtotal-price')) document.getElementById('cart-subtotal-price').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    const totalComFrete = total + (window.valorFreteAtual || 0);
    if (cartTotalPrice) cartTotalPrice.textContent = `R$ ${totalComFrete.toFixed(2).replace('.', ',')}`;
    
    localStorage.setItem('balmantex_cart', JSON.stringify(cart));
}

// Adicionar Item
window.addToCart = function(productId) {
    const products = JSON.parse(localStorage.getItem('balmantex_products'));
    const product = products.find(p => p.id === productId);
    
    if (product) {
        const existingItem = cart.find(item => item.id === productId);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({ ...product, quantity: 1 });
        }
        updateCartUI();
        toggleCart(); 
    }
};

// Remover Item
window.removeFromCart = function(index) {
    cart.splice(index, 1);
    updateCartUI();
};

// ==========================================
// 3. CHECKOUT E MERCADO PAGO
// ==========================================
if (btnCheckout) {
    btnCheckout.addEventListener('click', async () => {
        if (cart.length === 0) return;
        if (window.valorFreteAtual === 0) {
            showModal('Atenção', 'Por favor, calcule o frete digitando o seu CEP antes de prosseguir para o pagamento.', 'warning');
            return;
        }

        // Verifica se o cliente está logado
        const token = localStorage.getItem('balmantex_client_token');
        if (!token) {
            showModal("Atenção", "Por favor, faça o login ou cadastre-se para finalizar a sua compra no atacado ou varejo.", "warning", () => {
    window.location.href = 'login-cliente.html';
});
            window.location.href = 'login-cliente.html';
            return;
        }

        const originalText = btnCheckout.textContent;
        btnCheckout.textContent = "Gerando Pagamento Seguro...";
        btnCheckout.disabled = true;

        try {
            const response = await fetch('/create_preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cart)
            });

            const data = await response.json();

            if (data.init_point) {
                localStorage.removeItem('balmantex_cart');
                window.location.href = data.init_point;
            } else {
                alert("Erro ao gerar link de pagamento. Verifique as credenciais no servidor.");
                btnCheckout.textContent = originalText;
                btnCheckout.disabled = false;
            }
        } catch (error) {
            console.error("Erro de conexão:", error);
            alert("Falha na comunicação com o servidor financeiro.");
            btnCheckout.textContent = originalText;
            btnCheckout.disabled = false;
        }
    });
}

// ==========================================
// 4. RENDERIZAÇÃO DA VITRINE (VIA API)
// ==========================================
async function carregarVitrine() {
    const vitrine = document.getElementById('vitrine');
    if (!vitrine) return;

    try {
        const response = await fetch('/api/produtos');
        const allProducts = await response.json();
        
        window.produtosAtuais = allProducts; // Salva para o carrinho conseguir achar o produto
        renderVitrineDOM(allProducts);

        // Lógica dos filtros
        document.querySelectorAll('.btn-filtro').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelector('.btn-filtro.active').classList.remove('active');
                button.classList.add('active');
                const category = button.getAttribute('data-cat');
                const filtered = category === 'todos' ? allProducts : allProducts.filter(p => p.category === category);
                renderVitrineDOM(filtered); 
            });
        });
    } catch (error) {
        console.error("Erro ao carregar produtos:", error);
    }
}

function renderVitrineDOM(productsToDisplay) {
    const vitrine = document.getElementById('vitrine');
    vitrine.innerHTML = '';

    if (productsToDisplay.length === 0) {
        vitrine.innerHTML = '<p style="text-align:center; grid-column: 1/-1; color: #7A7A7A;">Nenhum produto cadastrado nesta categoria ainda.</p>';
        return;
    }

    productsToDisplay.forEach(prod => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <img src="${prod.image}" alt="${prod.name}">
            <h3>${prod.name}</h3>
            <p style="font-size: 0.8rem; color: var(--primary-color); text-transform: uppercase; font-weight:600;">${prod.category}</p>
            <p>${prod.desc}</p>
            <p class="size" style="font-size: 0.9rem; color: #7A7A7A; margin-bottom: 10px;"><strong>Tamanho:</strong> ${prod.size}</p>
            <p class="price">R$ ${parseFloat(prod.price).toFixed(2).replace('.', ',')}</p>
            ${prod.estoque > 0 ? `<button class="btn-primary" style="width: 100%; border-radius: 8px; box-shadow: none;" onclick="addToCart(${prod.id})">Adicionar ao Carrinho</button>` : `<button class="btn-secondary" style="width: 100%; border-radius: 8px; cursor: not-allowed; opacity: 0.6;" disabled>Esgotado</button>`}
        `;
        vitrine.appendChild(card);
    });
}

const vitrineContainer = document.getElementById('vitrine');
if (vitrineContainer) {
    carregarVitrine();
    updateCartUI(); 

    const clientName = localStorage.getItem('balmantex_client_name');
    const loginLink = document.getElementById('link-login-menu');
    if (clientName && loginLink) {
        
        const nav = loginLink.parentElement;
        if (!document.getElementById('link-meus-pedidos')) {
            const btnPedidos = document.createElement('a');
            btnPedidos.id = 'link-meus-pedidos';
            btnPedidos.href = "#";
            btnPedidos.textContent = "📦 Meus Pedidos";
            btnPedidos.style.color = "var(--text-dark)";
            btnPedidos.addEventListener('click', (ev) => { ev.preventDefault(); abrirMeusPedidos(); });
            nav.insertBefore(btnPedidos, loginLink);
        }
        loginLink.textContent = `Sair (${clientName.split(' ')[0]})`;
        loginLink.style.color = "#e74c3c";

        loginLink.href = "#"; 
        loginLink.addEventListener('click', (e) => {
    e.preventDefault();
    showModal("Sair da Conta", "Deseja realmente sair da sua conta Balmantex?", "warning", () => {
        localStorage.removeItem('balmantex_client_token');
        localStorage.removeItem('balmantex_client_name');
        window.location.reload();
    });
});
    }
}

// Atualização Importante: Modificar o botão "Adicionar Item" que está lá no BLOCO 2 do código
window.addToCart = function(productId) {
    // Agora ele busca da variável global que carregou do banco
    const product = window.produtosAtuais.find(p => p.id === productId);
    if (product) {
        const existingItem = cart.find(item => item.id === productId);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({ ...product, quantity: 1 });
        }
        updateCartUI();
        toggleCart(); 
    }
};

// ==========================================
// 5. PAINEL ADMIN (CRUD VIA API)
// ==========================================
const loginFormAdmin = document.getElementById('login-form');
const addProductForm = document.getElementById('add-product-form');
const adminTableBody = document.getElementById('admin-table-body');

async function renderAdminTable() {
    if (!adminTableBody) return;
    
    try {
        const response = await fetch('/api/produtos');
        const products = await response.json();
        
        window.produtosAdmin = products; // Salva para facilitar edição
        adminTableBody.innerHTML = '';

        if (products.length === 0) {
            adminTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 30px; color:#7A7A7A;">Sua vitrine está vazia. Cadastre um produto acima.</td></tr>';
            return;
        }

        products.forEach(prod => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid #EAEAEA";
            tr.innerHTML = `
                <td style="padding: 15px; width: 80px;">
                    <img src="${prod.image}" alt="img" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 1px solid #ddd;">
                </td>
                <td style="padding: 15px;">
                    <strong style="color: var(--text-dark);">${prod.name}</strong><br>
                    <span style="font-size: 0.8rem; color: #888; text-transform: uppercase;">${prod.category} | Tamanho: ${prod.size}</span>
                </td>
                <td style="padding: 15px; font-weight: 600; color: var(--primary-color);">
                    R$ ${parseFloat(prod.price).toFixed(2).replace('.', ',')}
                </td>
                <td style="padding: 15px;">
                    <button onclick="editProduct(${prod.id})" style="background-color: #3498db; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; margin-right: 5px; font-size: 0.8rem;">✏️ Editar</button>
                    <button onclick="deleteProduct(${prod.id})" style="background-color: #e74c3c; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">🗑️ Excluir</button>
                </td>
            `;
            adminTableBody.appendChild(tr);
        });
    } catch (error) {
        console.error("Erro ao carregar admin:", error);
    }
}

window.deleteProduct = async function(id) {
    showModal("Excluir Produto", "Tem certeza que deseja remover esta peça da vitrine? Essa ação não pode ser desfeita.", "error", async () => {
        await fetch(`/api/produtos/${id}`, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + sessionStorage.getItem('admin_token') } });
        renderAdminTable(); 
    });
};

window.editProduct = function(id) {
    const prod = window.produtosAdmin.find(p => p.id === id);
    if(prod) {
        document.getElementById('prod-name').value = prod.name;
        document.getElementById('prod-category').value = prod.category;
        document.getElementById('prod-size').value = prod.size;
        document.getElementById('prod-price').value = prod.price;
        if(document.getElementById('prod-estoque')) document.getElementById('prod-estoque').value = prod.estoque || 0;
        document.getElementById('prod-desc').value = prod.desc;
        
        addProductForm.dataset.editId = prod.id;
        document.getElementById('form-titulo').textContent = "✏️ Editando Produto";
        document.getElementById('form-subtitulo').textContent = "Altere os dados desejados e salve.";
        document.getElementById('btn-salvar').textContent = "Atualizar Produto";
        document.getElementById('btn-salvar').style.backgroundColor = "#3498db";
        document.getElementById('btn-cancelar').style.display = "block";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

if (loginFormAdmin) {
    const getAdminToken = () => sessionStorage.getItem('admin_token');

    const mostrarPainelAdmin = () => {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('admin-section').style.display = 'block';
        renderAdminTable();
    };

    const limparSessaoAdmin = () => {
        sessionStorage.removeItem('isLoggedIn');
        sessionStorage.removeItem('admin_token');
    };

    if (sessionStorage.getItem('isLoggedIn') === 'true' && getAdminToken()) {
        mostrarPainelAdmin();
    } else {
        limparSessaoAdmin();
    }

    loginFormAdmin.addEventListener('submit', async (e) => {
        e.preventDefault();

        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value;
        const loginError = document.getElementById('login-error');

        loginError.style.display = 'none';

        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pass })
            });

            const data = await response.json();

            if (!response.ok || !data.token) {
                loginError.textContent = data.error || 'Credenciais inválidas.';
                loginError.style.display = 'block';
                limparSessaoAdmin();
                return;
            }

            sessionStorage.setItem('isLoggedIn', 'true');
            sessionStorage.setItem('admin_token', data.token);
            mostrarPainelAdmin();

        } catch (error) {
            console.error('Erro no login admin:', error);
            loginError.textContent = 'Erro de comunicação com o servidor.';
            loginError.style.display = 'block';
            limparSessaoAdmin();
        }
    });

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            limparSessaoAdmin();
            window.location.reload();
        });
    }

    const btnCancelar = document.getElementById('btn-cancelar');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', () => { resetForm(); });
    }

    function resetForm() {
        addProductForm.reset();
        addProductForm.dataset.editId = "";
        document.getElementById('form-titulo').textContent = "Adicionar Novo Produto";
        document.getElementById('form-subtitulo').textContent = "Preencha os detalhes para cadastrar a peça.";
        document.getElementById('btn-salvar').textContent = "Salvar Produto";
        document.getElementById('btn-salvar').style.backgroundColor = "var(--primary-color)";
        document.getElementById('btn-cancelar').style.display = "none";
    }

    addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const adminToken = getAdminToken();
        if (!adminToken) {
            showModal("Sessão expirada", "Faça login novamente para continuar.", "warning", () => {
                limparSessaoAdmin();
                window.location.reload();
            });
            return;
        }
        
        const name = document.getElementById('prod-name').value;
        const category = document.getElementById('prod-category').value;
        const size = document.getElementById('prod-size').value;
        const price = document.getElementById('prod-price').value;
        const estoque = document.getElementById('prod-estoque') ? document.getElementById('prod-estoque').value : 0;
        const desc = document.getElementById('prod-desc').value;
        const imageFile = document.getElementById('prod-image').files[0];
        const editId = addProductForm.dataset.editId;

        if (imageFile) {
            const reader = new FileReader();
            reader.onload = function(event) { saveData(event.target.result); };
            reader.readAsDataURL(imageFile);
        } else {
            if (editId) {
                const existingProduct = window.produtosAdmin.find(p => p.id == editId);
                saveData(existingProduct.image);
            } else {
                showModal("Atenção", "Para cadastrar um produto novo, é obrigatório enviar uma foto.", "warning");
            }
        }

        async function saveData(imageBase64) {
            const payload = { name, category, size, price, desc, image: imageBase64, estoque };
            
            try {
                let response;

                if (editId) {
                    response = await fetch(`/api/produtos/${editId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + adminToken
                        },
                        body: JSON.stringify(payload)
                    });
                } else {
                    response = await fetch('/api/produtos', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + adminToken
                        },
                        body: JSON.stringify(payload)
                    });
                }

                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    showModal("Erro", data.error || "Não foi possível salvar o produto.", "error");
                    return;
                }

                resetForm();
                renderAdminTable();
                showModal("Sucesso", editId ? "Produto atualizado com sucesso." : "Produto cadastrado com sucesso.", "success");

            } catch (error) {
                console.error("Erro ao salvar produto:", error);
                showModal("Erro", "Falha de comunicação com o servidor.", "error");
            }
        }
    });
}



// ==========================================
// 6. FORMULÁRIO DE CONTATO (REVENDEDOR)
// ==========================================
const formRevendedor = document.getElementById('form-revendedor');
if (formRevendedor) {
    formRevendedor.addEventListener('submit', (e) => {
        e.preventDefault();
        const nome = document.getElementById('rev-nome').value;
        const cidade = document.getElementById('rev-cidade').value;
        const telefone = document.getElementById('rev-telefone').value;
        const zapNumber = "5544999345231";
        const msg = `Olá, Balmantex! Quero ser revendedor.\n\n*Dados:*\n👤 ${nome}\n📍 ${cidade}\n📱 ${telefone}`;
        window.open(`https://wa.me/${zapNumber}?text=${encodeURIComponent(msg)}`, '_blank');
        formRevendedor.reset();
    });
}

// ==========================================
// 7. AUTENTICAÇÃO DO CLIENTE (LOGIN E CADASTRO)
// ==========================================
const formCadastro = document.getElementById('form-cadastro-cliente');
const formLogin = document.getElementById('form-login-cliente');
const msgCadastro = document.getElementById('msg-cadastro');
const msgLogin = document.getElementById('msg-login');

// Máscaras de Input
const mascaraCPF = (v) => {
    v = v.replace(/\D/g, "");
    if (v.length <= 11) {
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else {
        v = v.replace(/^(\d{2})(\d)/, "$1.$2");
        v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
        v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
        v = v.replace(/(\d{4})(\d)/, "$1-$2");
    }
    return v;
};

const mascaraTel = (v) => {
    v = v.replace(/\D/g, "");
    v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
    v = v.replace(/(\d)(\d{4})$/, "$1-$2");
    return v;
};

const mascaraCEP = (v) => {
    v = v.replace(/\D/g, "");
    v = v.replace(/^(\d{5})(\d)/, "$1-$2");
    return v;
};

if(document.getElementById('cad-cpf_cnpj')) document.getElementById('cad-cpf_cnpj').addEventListener('input', (e) => e.target.value = mascaraCPF(e.target.value));
if(document.getElementById('cad-telefone')) document.getElementById('cad-telefone').addEventListener('input', (e) => e.target.value = mascaraTel(e.target.value));
if(document.getElementById('cad-cep')) document.getElementById('cad-cep').addEventListener('input', (e) => e.target.value = mascaraCEP(e.target.value));

// Consulta ViaCEP
const inputCep = document.getElementById('cad-cep');
if (inputCep) {
    inputCep.addEventListener('blur', async (e) => {
        const cep = e.target.value.replace(/\D/g, '');
        if (cep.length === 8) {
            document.getElementById('cep-loading').style.display = 'block';
            try {
                const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                const data = await res.json();
                if (!data.erro) {
                    document.getElementById('cad-rua').value = data.logradouro;
                    document.getElementById('cad-bairro').value = data.bairro;
                    document.getElementById('cad-cidade').value = data.localidade;
                    document.getElementById('cad-estado').value = data.uf;
                    document.getElementById('cad-numero').focus();
                } else {
                    showModal("Ops!", "Não conseguimos encontrar esse CEP. Por favor, verifique se os números estão corretos.", "error");
                }
            } catch (error) {
                console.error("Erro no ViaCEP:", error);
            }
            document.getElementById('cep-loading').style.display = 'none';
        }
    });
}

// Cadastro de Cliente (POST para a API)
if (formCadastro) {
    formCadastro.addEventListener('submit', async (e) => {
        e.preventDefault();
        msgCadastro.style.color = 'var(--text-dark)';
        msgCadastro.textContent = 'Criando sua conta...';

        const dados = {
            nome: document.getElementById('cad-nome').value,
            cpf_cnpj: document.getElementById('cad-cpf_cnpj').value,
            telefone: document.getElementById('cad-telefone').value,
            cep: document.getElementById('cad-cep').value,
            rua: document.getElementById('cad-rua').value,
            numero: document.getElementById('cad-numero').value,
            bairro: document.getElementById('cad-bairro').value,
            cidade: document.getElementById('cad-cidade').value,
            estado: document.getElementById('cad-estado').value,
            email: document.getElementById('cad-email').value,
            senha: document.getElementById('cad-senha').value
        };

        try {
            const response = await fetch('/api/cadastrar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });

            const resData = await response.json();

            if (response.ok) {
                msgCadastro.style.color = 'var(--whatsapp-green)';
                msgCadastro.textContent = 'Conta criada com sucesso! Faça login ao lado.';
                formCadastro.reset();
            } else {
                msgCadastro.style.color = '#e74c3c';
                msgCadastro.textContent = resData.error;
            }
        } catch (error) {
            msgCadastro.style.color = '#e74c3c';
            msgCadastro.textContent = 'Erro de comunicação com o servidor.';
        }
    });
}

// Login de Cliente (POST para a API)
if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        msgLogin.style.color = 'var(--text-dark)';
        msgLogin.textContent = 'Entrando...';

        const dados = {
            email: document.getElementById('login-email').value,
            senha: document.getElementById('login-senha').value
        };

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });

            const resData = await response.json();

            if (response.ok) {
                localStorage.setItem('balmantex_client_token', resData.token);
                localStorage.setItem('balmantex_client_name', resData.nome);
                
                msgLogin.style.color = 'var(--whatsapp-green)';
                msgLogin.textContent = 'Acesso liberado! Redirecionando...';
                
                setTimeout(() => { window.location.href = 'index.html'; }, 1000);
            } else {
                msgLogin.style.color = '#e74c3c';
                msgLogin.textContent = resData.error;
            }
        } catch (error) {
            msgLogin.style.color = '#e74c3c';
            msgLogin.textContent = 'Erro de comunicação com o servidor.';
        }
    });
}
// ==========================================
// 8. CHECKOUT TRANSPARENTE (BRICKS)
// ==========================================
const btnIniciarPagamento = document.getElementById('btn-iniciar-pagamento');
const brickContainer = document.getElementById('paymentBrick_container');

if (btnIniciarPagamento) {
    btnIniciarPagamento.addEventListener('click', async () => {
        if (cart.length === 0) return;

        if (window.valorFreteAtual === 0) {
            showModal("Atenção", "Por favor, digite seu CEP e calcule o frete antes de prosseguir para o pagamento.", "warning");
            return;
        }

        const token = localStorage.getItem('balmantex_client_token');
        if (!token) {
            showModal("Atenção", "Faça o login ou cadastre-se para finalizar a compra.", "warning", () => {
                window.location.href = 'login-cliente.html';
            });
            return;
        }

        btnIniciarPagamento.textContent = 'Gerando Pagamento Seguro...';
        btnIniciarPagamento.style.opacity = '0.7';
        btnIniciarPagamento.disabled = true;
        btnIniciarPagamento.style.cursor = 'wait';
        setTimeout(() => {
            btnIniciarPagamento.style.display = 'none';
            
        }, 1200);
        // Oculta botão antigo:
        brickContainer.style.display = 'block';

        // ATENÇÃO: COLOQUE SUA PUBLIC KEY NA LINHA ABAIXO
        const mp = new MercadoPago('APP_USR-coloque-sua-public-key-aqui', { locale: 'pt-BR' });
        const bricksBuilder = mp.bricks();

        let totalValor = 0;
        cart.forEach(item => totalValor += parseFloat(item.price) * item.quantity);
        totalValor += (window.valorFreteAtual || 0);

        const renderPaymentBrick = async (bricksBuilder) => {
            const settings = {
                initialization: { amount: totalValor },
                customization: {
                    paymentMethods: { ticket: "all", bankTransfer: "all", creditCard: "all", debitCard: "all", mercadoPago: "all" },
                    visual: { style: { theme: 'bootstrap', customVariables: { formBackgroundColor: '#ffffff', baseColor: '#D97757' } } }
                },
                callbacks: {
                    onReady: () => { console.log('Brick pronto!'); },
                    onSubmit: ({ selectedPaymentMethod, formData }) => {
                        return new Promise((resolve, reject) => {
                            fetch('/process_payment', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({ formData, cart, valorFrete: window.valorFreteAtual })
                            })
                            .then((response) => response.json())
                            .then((response) => {
                                resolve();
                                if(response.status === 'approved' || response.status === 'pending' || response.status === 'in_process') {
                                    localStorage.removeItem('balmantex_cart');
                                    showModal("Sucesso!", "Seu pagamento está sendo processado!", "success", () => {
                                        window.location.reload();
                                    });
                                } else {
                                    showModal("Aviso", "Pagamento recusado.", "error");
                                }
                            })
                            .catch((error) => {
                                reject();
                                showModal("Erro", "Falha na comunicação.", "error");
                            });
                        });
                    },
                    onError: (error) => { console.error(error); }
                },
            };
            window.paymentBrickController = await bricksBuilder.create('payment', 'paymentBrick_container', settings);
        };
        renderPaymentBrick(bricksBuilder);
    });
}

// ==========================================
// 9. EXPANSÃO DO PAINEL ADMIN (PEDIDOS E CLIENTES)
// ==========================================
const adminPedidosBody = document.getElementById('admin-pedidos-body');
const adminClientesBody = document.getElementById('admin-clientes-body');


// Renderizar Tabela de Pedidos
window.atualizarRastreio = async function(id) {
    const rastreio = prompt("Digite o Código de Rastreio dos Correios ou Transportadora:");
    if (rastreio) {
        try {
            await fetch('/api/admin/pedidos/' + id + '/rastreio', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sessionStorage.getItem('admin_token') },
                body: JSON.stringify({ rastreio })
            });
            carregarPedidosAdmin();
            showModal("Sucesso", "O código de rastreio foi guardado e o status alterado para Enviado!", "success");
        } catch(e) { showModal("Erro", "Falha ao guardar o código de rastreio.", "error"); }
    }
};

async function carregarPedidosAdmin() {
    if (!adminPedidosBody) return;
    try {
        const response = await fetch('/api/admin/pedidos', { headers: { 'Authorization': 'Bearer ' + sessionStorage.getItem('admin_token') } });
        const pedidos = await response.json();
        
        adminPedidosBody.innerHTML = '';
        if (pedidos.length === 0) {
            adminPedidosBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Nenhum pedido realizado ainda.</td></tr>';
            return;
        }

        pedidos.forEach(ped => {
            const dataData = new Date(ped.data_criacao).toLocaleDateString('pt-BR');
            const valorTotal = parseFloat(ped.total).toFixed(2).replace('.', ',');
            
            let statusColor = '#7A7A7A';
            if(ped.status.includes('Pago')) statusColor = 'var(--whatsapp-green)';
            if(ped.status.includes('Recusado')) statusColor = '#e74c3c';
            if(ped.status.includes('Enviado')) statusColor = '#3498db';

            let acaoHtml = '';
            // Se o pedido estiver pago, aparece o botão para inserir o rastreio
            if (ped.status.includes('Pago e Confirmado')) {
                acaoHtml = `<br><button onclick="atualizarRastreio(${ped.id})" style="margin-top: 8px; background: #3498db; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.75rem;">📦 Informar Rastreio</button>`;
            } else if (ped.rastreio) {
                // Se já tiver rastreio, mostra o código na tela
                acaoHtml = `<br><small style="color: #3498db; font-weight: bold; display:inline-block; margin-top: 5px;">Rastreio: ${ped.rastreio}</small>`;
            }

            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid #EAEAEA";
            tr.innerHTML = `
                <td style="padding: 15px;"><strong>#${ped.id}</strong></td>
                <td style="padding: 15px;">${ped.cliente_nome}<br><small style="color: #888;">${ped.cliente_telefone}</small></td>
                <td style="padding: 15px;">${dataData}</td>
                <td style="padding: 15px; font-weight: bold;">R$ ${valorTotal}</td>
                <td style="padding: 15px;">
                    <span style="color: white; background-color: ${statusColor}; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem;">${ped.status}</span>
                    ${acaoHtml}
                </td>
            `;
            adminPedidosBody.appendChild(tr);
        });
    } catch (error) {
        console.error('Erro ao carregar pedidos:', error);
    }
}


// Renderizar Tabela de Clientes
async function carregarClientesAdmin() {
    if (!adminClientesBody) return;
    try {
        const response = await fetch('/api/admin/clientes', { headers: { 'Authorization': 'Bearer ' + sessionStorage.getItem('admin_token') } });
        const clientes = await response.json();
        
        adminClientesBody.innerHTML = '';
        if (clientes.length === 0) {
            adminClientesBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">Nenhum cliente cadastrado.</td></tr>';
            return;
        }

        clientes.forEach(cli => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid #EAEAEA";
            tr.innerHTML = `
                <td style="padding: 15px;">${cli.id}</td>
                <td style="padding: 15px;"><strong>${cli.nome}</strong></td>
                <td style="padding: 15px;">${cli.email}<br><small>${cli.telefone}</small></td>
                <td style="padding: 15px;">${cli.cidade} - ${cli.estado}</td>
            `;
            adminClientesBody.appendChild(tr);
        });
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
    }
}

// Se estiver na tela de admin, carrega as novas tabelas
if(document.getElementById('admin-section') && sessionStorage.getItem('admin_token')) {
    carregarPedidosAdmin();
    carregarClientesAdmin();
}


// ==========================================
// 10. ÁREA DO CLIENTE (MEUS PEDIDOS)
// ==========================================
window.abrirMeusPedidos = async function() {
    const token = localStorage.getItem('balmantex_client_token');
    if (!token) return;
    
    try {
        const response = await fetch('/api/meus-pedidos', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const pedidos = await response.json();
        
        let htmlPedidos = '<div style="max-height: 400px; overflow-y: auto; text-align: left; padding-right: 10px;">';
        if (pedidos.length === 0) {
            htmlPedidos += '<p style="text-align:center; color: #7A7A7A; margin-top: 20px;">Você ainda não tem nenhum pedido.</p>';
        } else {
            pedidos.forEach(p => {
                const data = new Date(p.data_criacao).toLocaleDateString('pt-BR');
                const valor = parseFloat(p.total).toFixed(2).replace('.', ',');
                let statusColor = p.status.includes('Pago') ? '#25D366' : (p.status.includes('Enviado') ? '#3498db' : '#7A7A7A');
                
                htmlPedidos += `
                <div style="border: 1px solid #EAEAEA; padding: 15px; border-radius: 8px; margin-bottom: 12px; background: #FAFAFA;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center;">
                        <strong style="color: var(--text-dark); font-size: 1.1rem;">Pedido #${p.id}</strong>
                        <span style="color: white; background-color: ${statusColor}; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">${p.status}</span>
                    </div>
                    <p style="margin: 0 0 5px 0; font-size: 0.9rem; color: #555;"><strong>Data:</strong> ${data}</p>
                    <p style="margin: 0; font-size: 0.9rem; color: #555;"><strong>Total:</strong> R$ ${valor}</p>
                    ${p.rastreio ? `<div style="margin-top: 12px; font-size: 0.9rem; background: #e8f4f8; padding: 10px; border-radius: 6px; color: #0277bd; border-left: 4px solid #3498db;"><strong>📦 Cód. Rastreio:</strong> ${p.rastreio}</div>` : ''}
                </div>`;
            });
        }
        htmlPedidos += '</div>';
        
        showModal("Meus Pedidos", htmlPedidos, "info");
    } catch(e) {
        showModal("Erro", "Não foi possível carregar os seus pedidos.", "error");
    }
};
