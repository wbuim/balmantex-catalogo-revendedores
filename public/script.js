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
// WCODE: HELPERS DE ESTOQUE, PESO E VOLUME
// ==========================================
function getEstoqueDisponivelProduto(produto) {
    return Number(produto?.estoque_disponivel ?? produto?.estoque ?? 0);
}

function formatNumeroBR(valor, casas = 3) {
    const n = Number(valor || 0);
    return n.toLocaleString('pt-BR', {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas
    });
}

function formatKg(valor) {
    const n = Number(valor || 0);
    if (!n) return '0 kg';
    return `${formatNumeroBR(n, 3)} kg`;
}

function formatM3(valor) {
    const n = Number(valor || 0);
    if (!n) return '0 m³';
    return `${formatNumeroBR(n, 3)} m³`;
}

function totaisLogisticosCarrinho() {
    return cart.reduce((acc, item) => {
        const qtd = Number(item.quantity || 0);
        acc.peso += Number(item.peso || 0) * qtd;
        acc.volume += Number(item.volume || 0) * qtd;
        return acc;
    }, { peso: 0, volume: 0 });
}

function garantirResumoLogisticoCarrinho() {
    const footer = document.querySelector('.cart-footer');
    const subtotal = document.getElementById('cart-subtotal-price');
    if (!footer || !subtotal || document.getElementById('cart-logistica-resumo')) return;

    const box = document.createElement('div');
    box.id = 'cart-logistica-resumo';
    box.style.cssText = 'font-size:0.85rem;color:#7A7A7A;margin:-4px 0 12px 0;line-height:1.5;';
    box.innerHTML = `
        <div><strong>Peso estimado:</strong> <span id="cart-peso-total">0 kg</span></div>
        <div><strong>Volume estimado:</strong> <span id="cart-volume-total">0 m³</span></div>
    `;

    const subtotalBox = subtotal.closest('.cart-total');
    if (subtotalBox && subtotalBox.parentNode) {
        subtotalBox.parentNode.insertBefore(box, subtotalBox.nextSibling);
    }
}

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
    garantirResumoLogisticoCarrinho();
    
    cartItemsContainer.innerHTML = '';
    let total = 0;

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p style="text-align:center; color:#7A7A7A; margin-top:20px;">Seu carrinho está vazio.</p>';
        if (cartCount) cartCount.textContent = '0';
        if (document.getElementById('cart-subtotal-price')) document.getElementById('cart-subtotal-price').textContent = 'R$ 0,00';
        if (document.getElementById('cart-peso-total')) document.getElementById('cart-peso-total').textContent = '0 kg';
        if (document.getElementById('cart-volume-total')) document.getElementById('cart-volume-total').textContent = '0 m³';
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
        const disponivel = getEstoqueDisponivelProduto(item);
        itemElement.innerHTML = `
            <img src="${item.image}" alt="${item.name}">
            <div class="cart-item-info">
                <h4>${item.name}</h4>
                <p style="margin: 0 0 5px 0;">
                    Estoque disponível: <strong>${disponivel}</strong>
                </p>
                <div style="display:flex; align-items:center; gap:8px; margin:6px 0;">
                    <button type="button" onclick="changeCartQuantity(${index}, -1)" style="width:28px;height:28px;border-radius:50%;border:1px solid #ddd;background:#fff;padding:0;">−</button>
                    <strong>${item.quantity}</strong>
                    <button type="button" onclick="changeCartQuantity(${index}, 1)" style="width:28px;height:28px;border-radius:50%;border:1px solid #ddd;background:#fff;padding:0;">+</button>
                </div>
                <div style="font-size:0.78rem;color:#777;margin-bottom:4px;">
                    Peso: ${formatKg(Number(item.peso || 0) * Number(item.quantity || 0))} |
                    Volume: ${formatM3(Number(item.volume || 0) * Number(item.quantity || 0))}
                </div>
                <div class="cart-item-price">R$ ${(parseFloat(item.price) * item.quantity).toFixed(2).replace('.', ',')}</div>
                <button class="remove-item" onclick="removeFromCart(${index})">Remover</button>
            </div>
        `;
        cartItemsContainer.appendChild(itemElement);
    });

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (cartCount) cartCount.textContent = totalItems;
    if (document.getElementById('cart-subtotal-price')) document.getElementById('cart-subtotal-price').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    const totaisLogisticos = totaisLogisticosCarrinho();
    if (document.getElementById('cart-peso-total')) document.getElementById('cart-peso-total').textContent = formatKg(totaisLogisticos.peso);
    if (document.getElementById('cart-volume-total')) document.getElementById('cart-volume-total').textContent = formatM3(totaisLogisticos.volume);
    const totalComFrete = total + (window.valorFreteAtual || 0);
    if (cartTotalPrice) cartTotalPrice.textContent = `R$ ${totalComFrete.toFixed(2).replace('.', ',')}`;
    
    localStorage.setItem('balmantex_cart', JSON.stringify(cart));
}

// Remover Item
window.removeFromCart = function(index) {
    cart.splice(index, 1);
    updateCartUI();
};


window.changeCartQuantity = function(index, delta) {
    const item = cart[index];
    if (!item) return;

    const disponivel = getEstoqueDisponivelProduto(item);
    const novaQtd = Number(item.quantity || 0) + Number(delta || 0);

    if (novaQtd <= 0) {
        removeFromCart(index);
        return;
    }

    if (novaQtd > disponivel) {
        showModal("Estoque insuficiente", `Temos apenas ${disponivel} unidade(s) disponível(is) deste produto.`, "warning");
        return;
    }

    item.quantity = novaQtd;
    updateCartUI();
};

// ==========================================
// 4. RENDERIZAÇÃO DA VITRINE (VIA API)
// ==========================================
async function carregarVitrine() {
    const vitrine = document.getElementById('vitrine');
    if (!vitrine) return;

    try {
        const response = await fetch('/api/produtos?somenteComFoto=1');
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
    productsToDisplay = (productsToDisplay || []).filter(prod => prod.image && String(prod.image).trim() !== '');
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
                        <p class="size" style="font-size: 0.9rem; color: #7A7A7A; margin-bottom: 6px;"><strong>Tamanho:</strong> ${prod.size}</p>
            <p style="font-size: 0.82rem; color: #7A7A7A; margin-bottom: 6px;">
                <strong>Estoque:</strong> ${getEstoqueDisponivelProduto(prod)} un.
                ${Number(prod.peso || 0) > 0 ? ` | <strong>Peso:</strong> ${formatKg(prod.peso)}` : ''}
                ${Number(prod.volume || 0) > 0 ? ` | <strong>Vol.:</strong> ${formatM3(prod.volume)}` : ''}
            </p>
            <p class="price">R$ ${parseFloat(prod.price).toFixed(2).replace('.', ',')}</p>
            ${getEstoqueDisponivelProduto(prod) > 0 ? `<button class="btn-primary" style="width: 100%; border-radius: 8px; box-shadow: none;" onclick="addToCart(${prod.id})">Adicionar ao Pedido para Revenda</button>` : `<button class="btn-secondary" style="width: 100%; border-radius: 8px; cursor: not-allowed; opacity: 0.6;" disabled>Esgotado</button>`}
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

// Adicionar ao carrinho respeitando estoque disponível
window.addToCart = function(productId) {
    const product = (window.produtosAtuais || []).find(p => Number(p.id) === Number(productId));
    if (!product) {
        showModal("Erro", "Produto não encontrado na vitrine atual.", "error");
        return;
    }

    const disponivel = getEstoqueDisponivelProduto(product);
    const existingItem = cart.find(item => Number(item.id) === Number(productId));
    const qtdAtual = existingItem ? Number(existingItem.quantity || 0) : 0;

    if (disponivel <= 0) {
        showModal("Produto esgotado", "Este produto está sem estoque no momento.", "warning");
        return;
    }

    if (qtdAtual + 1 > disponivel) {
        showModal("Estoque insuficiente", `Você já adicionou a quantidade máxima disponível: ${disponivel} unidade(s).`, "warning");
        return;
    }

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }

    updateCartUI();
    toggleCart();
};


// ==========================================
// WCODE: FORMULÁRIO RETRÁTIL DE PRODUTO
// ==========================================
function abrirEditorProduto() {
    const card = document.getElementById('produto-editor-card');
    if (!card) return;

    card.classList.remove('produto-editor-hidden');

    setTimeout(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
}

function fecharEditorProduto() {
    const card = document.getElementById('produto-editor-card');
    if (!card) return;

    card.classList.add('produto-editor-hidden');
}

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

        window.produtosAdmin = Array.isArray(products) ? products : [];
        adminTableBody.innerHTML = '';

        const resumoBox = document.getElementById('estoque-resumo-admin');

        const totalProdutos = window.produtosAdmin.length;
        const totalEstoque = window.produtosAdmin.reduce((acc, p) => acc + Number(p.estoque || 0), 0);
        const totalReservado = window.produtosAdmin.reduce((acc, p) => acc + Number(p.estoque_reservado || 0), 0);
        const totalDisponivel = window.produtosAdmin.reduce((acc, p) => acc + getEstoqueDisponivelProduto(p), 0);
        const pesoTotal = window.produtosAdmin.reduce((acc, p) => acc + (Number(p.peso || 0) * Number(p.estoque || 0)), 0);
        const volumeTotal = window.produtosAdmin.reduce((acc, p) => acc + (Number(p.volume || 0) * Number(p.estoque || 0)), 0);

        if (resumoBox) {
            resumoBox.innerHTML = `
                <div class="estoque-card-resumo">
                    <span>Produtos</span>
                    <strong>${totalProdutos}</strong>
                </div>
                <div class="estoque-card-resumo">
                    <span>Estoque físico</span>
                    <strong>${totalEstoque}</strong>
                </div>
                <div class="estoque-card-resumo">
                    <span>Reservado</span>
                    <strong>${totalReservado}</strong>
                </div>
                <div class="estoque-card-resumo destaque">
                    <span>Disponível</span>
                    <strong>${totalDisponivel}</strong>
                </div>
                <div class="estoque-card-resumo">
                    <span>Peso estimado</span>
                    <strong>${formatKg(pesoTotal)}</strong>
                </div>
                <div class="estoque-card-resumo">
                    <span>Volume estimado</span>
                    <strong>${formatM3(volumeTotal)}</strong>
                </div>
            `;
        }

        if (window.produtosAdmin.length === 0) {
            adminTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 30px; color:#7A7A7A;">Nenhum produto cadastrado ainda.</td></tr>';
            return;
        }

        window.produtosAdmin.forEach(prod => {
            const estoque = Number(prod.estoque || 0);
            const reservado = Number(prod.estoque_reservado || 0);
            const disponivel = getEstoqueDisponivelProduto(prod);

            let statusClass = 'ok';
            let statusTexto = 'OK';

            if (disponivel <= 0) {
                statusClass = 'zerado';
                statusTexto = 'Zerado';
            } else if (disponivel <= 3) {
                statusClass = 'baixo';
                statusTexto = 'Baixo';
            }

            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid #EAEAEA";

            tr.innerHTML = `
                <td style="padding: 15px; width: 80px;">
                    <img src="${prod.image}" alt="img" style="width: 62px; height: 62px; object-fit: cover; border-radius: 8px; border: 1px solid #ddd;">
                </td>

                <td style="padding: 15px;">
                    <strong style="color: var(--text-dark);">${prod.name}</strong><br>
                    <small style="color:#888;">ID #${prod.id}</small>
                </td>

                <td style="padding: 15px;">
                    <span style="text-transform: uppercase; font-size: 0.78rem; color:#777;">${prod.category || '-'}</span><br>
                    <small>${prod.size || '-'}</small>
                </td>

                <td style="padding: 15px;">
                    <strong>${estoque}</strong> un.
                </td>

                <td style="padding: 15px;">
                    <strong style="color:#d97757;">${reservado}</strong> un.
                </td>

                <td style="padding: 15px;">
                    <span class="estoque-badge ${statusClass}">${disponivel} un. ${statusTexto}</span>
                </td>

                <td style="padding: 15px;">
                    <small>
                        <strong>Peso:</strong> ${formatKg(prod.peso)}<br>
                        <strong>Volume:</strong> ${formatM3(prod.volume)}
                    </small>
                </td>

                <td style="padding: 15px; font-weight: 600; color: var(--primary-color);">
                    R$ ${parseFloat(prod.price || 0).toFixed(2).replace('.', ',')}
                </td>

                <td style="padding: 15px; min-width: 210px;">
                    <button onclick="entradaEstoque(${prod.id})" class="btn-admin-mini btn-entrada">+ Entrada</button>
                    <button onclick="saidaEstoque(${prod.id})" class="btn-admin-mini btn-saida">- Saída</button>
                    <button onclick="editProduct(${prod.id})" class="btn-admin-mini btn-editar">✏️ Editar</button>
                    <button onclick="deleteProduct(${prod.id})" class="btn-admin-mini btn-excluir">🗑️ Excluir</button>
                    <button onclick="verHistoricoEstoque(${prod.id})" class="btn-admin-mini btn-historico">📜 Histórico</button>
                </td>
            `;

            adminTableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Erro ao carregar estoque admin:", error);
        adminTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 30px; color:#e74c3c;">Erro ao carregar estoque.</td></tr>';
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
        abrirEditorProduto();
        document.getElementById('prod-name').value = prod.name;
        document.getElementById('prod-category').value = prod.category;
        document.getElementById('prod-size').value = prod.size;
        document.getElementById('prod-price').value = prod.price;
        if(document.getElementById('prod-estoque')) document.getElementById('prod-estoque').value = prod.estoque || 0;
        if(document.getElementById('prod-peso')) document.getElementById('prod-peso').value = prod.peso || 0;
        if(document.getElementById('prod-volume')) document.getElementById('prod-volume').value = prod.volume || 0;
        document.getElementById('prod-desc').value = prod.desc;
        
        addProductForm.dataset.editId = prod.id;
        document.getElementById('form-titulo').textContent = "✏️ Editando Produto";
        document.getElementById('form-subtitulo').textContent = "Altere os dados desejados e salve.";
        document.getElementById('btn-salvar').textContent = "Atualizar Produto";
        document.getElementById('btn-salvar').style.backgroundColor = "#3498db";
        document.getElementById('btn-cancelar').style.display = "block";
        abrirEditorProduto();
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


    const btnNovoProduto = document.getElementById('btn-novo-produto');
    if (btnNovoProduto) {
        btnNovoProduto.addEventListener('click', () => {
            resetForm();
            abrirEditorProduto();

            const campoNome = document.getElementById('prod-name');
            if (campoNome) {
                setTimeout(() => campoNome.focus(), 200);
            }
        });
    }

    const btnCancelar = document.getElementById('btn-cancelar');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', () => { resetForm(); fecharEditorProduto(); });
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
        const peso = document.getElementById('prod-peso') ? document.getElementById('prod-peso').value : 0;
        const volume = document.getElementById('prod-volume') ? document.getElementById('prod-volume').value : 0;
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
            const payload = { name, category, size, price, desc, image: imageBase64, estoque, peso, volume };
            
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
                fecharEditorProduto();
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
// WCODE: AJUSTE RÁPIDO DE ESTOQUE NO ADMIN
// ==========================================
async function alterarEstoqueRapido(id, tipo) {
    const prod = (window.produtosAdmin || []).find(p => Number(p.id) === Number(id));
    if (!prod) {
        showModal("Erro", "Produto não encontrado.", "error");
        return;
    }

    const atual = Number(prod.estoque || 0);
    const texto = tipo === 'entrada'
        ? `Adicionar quantas unidades ao estoque de "${prod.name}"?`
        : `Baixar quantas unidades do estoque de "${prod.name}"?`;

    const valor = prompt(texto, "1");
    if (valor === null) return;

    const qtd = Number(String(valor).replace(",", "."));

    if (!Number.isFinite(qtd) || qtd <= 0) {
        showModal("Valor inválido", "Informe uma quantidade maior que zero.", "warning");
        return;
    }

    let novoEstoque = tipo === 'entrada'
        ? atual + qtd
        : atual - qtd;

    if (novoEstoque < 0) {
        showModal("Estoque insuficiente", "A saída informada deixaria o estoque negativo.", "warning");
        return;
    }

    try {
        const response = await fetch(`/api/admin/produtos/${id}/estoque`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + sessionStorage.getItem('admin_token')
            },
            body: JSON.stringify({ estoque: novoEstoque })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            showModal("Erro", data.error || "Não foi possível atualizar o estoque.", "error");
            return;
        }

        showModal("Estoque atualizado", `Novo estoque de "${prod.name}": ${novoEstoque} unidade(s).`, "success");
        renderAdminTable();

    } catch (error) {
        console.error("Erro ao alterar estoque:", error);
        showModal("Erro", "Falha de comunicação com o servidor.", "error");
    }
}

window.entradaEstoque = function(id) {
    alterarEstoqueRapido(id, 'entrada');
};

window.saidaEstoque = function(id) {
    alterarEstoqueRapido(id, 'saida');
};


// ==========================================
// WCODE: HISTÓRICO DE MOVIMENTOS DE ESTOQUE
// ==========================================
function estoqueMovimentoMoedaBR(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function estoqueMovimentoNumero(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3
    });
}

function estoqueMovimentoDataBR(valor) {
    if (!valor) return '-';
    try {
        return new Date(valor).toLocaleString('pt-BR');
    } catch (e) {
        return valor;
    }
}

function estoqueMovimentoTipoLabel(tipo) {
    const mapa = {
        saldo_inicial: 'Saldo inicial',
        entrada_inicial: 'Entrada inicial',
        ajuste_manual: 'Ajuste manual',
        ajuste_edicao: 'Ajuste por edição',
        reserva: 'Reserva',
        liberacao_reserva: 'Liberação de reserva',
        venda_confirmada: 'Venda confirmada',
        entrada: 'Entrada',
        saida: 'Saída'
    };

    return mapa[tipo] || tipo || '-';
}

function estoqueMovimentoTipoClasse(tipo) {
    if (['entrada', 'entrada_inicial', 'saldo_inicial', 'liberacao_reserva'].includes(tipo)) return 'positivo';
    if (['saida', 'venda_confirmada', 'reserva'].includes(tipo)) return 'negativo';
    if (['ajuste_manual', 'ajuste_edicao'].includes(tipo)) return 'ajuste';
    return '';
}

function abrirModalHistoricoEstoque(html) {
    const existente = document.getElementById('historico-estoque-overlay');
    if (existente) existente.remove();

    const overlay = document.createElement('div');
    overlay.id = 'historico-estoque-overlay';
    overlay.className = 'historico-estoque-overlay';

    overlay.innerHTML = `
        <div class="historico-estoque-modal">
            <div class="historico-estoque-header">
                <h3>Histórico de Estoque</h3>
                <button type="button" class="historico-estoque-fechar">&times;</button>
            </div>
            <div class="historico-estoque-body">
                ${html}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();
    overlay.querySelector('.historico-estoque-fechar').addEventListener('click', fechar);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) fechar();
    });
}

window.verHistoricoEstoque = async function(id) {
    const produto = (window.produtosAdmin || []).find(p => Number(p.id) === Number(id));

    try {
        const response = await fetch(`/api/admin/estoque/movimentos?produto_id=${id}&limit=200`, {
            headers: {
                'Authorization': 'Bearer ' + sessionStorage.getItem('admin_token')
            }
        });

        const movimentos = await response.json();

        if (!response.ok) {
            showModal("Erro", movimentos.error || "Não foi possível carregar o histórico de estoque.", "error");
            return;
        }

        const linhas = Array.isArray(movimentos) && movimentos.length
            ? movimentos.map(mov => `
                <tr>
                    <td>${estoqueMovimentoDataBR(mov.data_criacao)}</td>
                    <td>
                        <span class="historico-tipo ${estoqueMovimentoTipoClasse(mov.tipo)}">
                            ${estoqueMovimentoTipoLabel(mov.tipo)}
                        </span>
                    </td>
                    <td style="text-align:right;"><strong>${estoqueMovimentoNumero(mov.quantidade)}</strong></td>
                    <td style="text-align:right;">${estoqueMovimentoNumero(mov.estoque_anterior)} → <strong>${estoqueMovimentoNumero(mov.estoque_novo)}</strong></td>
                    <td style="text-align:right;">${estoqueMovimentoNumero(mov.reservado_anterior)} → <strong>${estoqueMovimentoNumero(mov.reservado_novo)}</strong></td>
                    <td>${mov.motivo || '-'}</td>
                    <td>${mov.referencia_tipo || '-'} ${mov.referencia_id ? '#' + mov.referencia_id : ''}</td>
                    <td>${mov.usuario || '-'}</td>
                </tr>
            `).join('')
            : `<tr><td colspan="8" style="text-align:center; padding: 24px; color:#777;">Nenhum movimento encontrado para este produto.</td></tr>`;

        const produtoNome = produto?.name || movimentos?.[0]?.produto_nome || `Produto #${id}`;
        const estoqueAtual = produto ? Number(produto.estoque || 0) : null;
        const reservadoAtual = produto ? Number(produto.estoque_reservado || 0) : null;
        const disponivelAtual = produto ? getEstoqueDisponivelProduto(produto) : null;

        const html = `
            <div class="historico-produto-resumo">
                <div>
                    <span>Produto</span>
                    <strong>${produtoNome}</strong>
                </div>
                <div>
                    <span>Estoque físico</span>
                    <strong>${estoqueAtual === null ? '-' : estoqueMovimentoNumero(estoqueAtual)}</strong>
                </div>
                <div>
                    <span>Reservado</span>
                    <strong>${reservadoAtual === null ? '-' : estoqueMovimentoNumero(reservadoAtual)}</strong>
                </div>
                <div>
                    <span>Disponível</span>
                    <strong>${disponivelAtual === null ? '-' : estoqueMovimentoNumero(disponivelAtual)}</strong>
                </div>
            </div>

            <div class="historico-table-wrap">
                <table class="historico-estoque-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Tipo</th>
                            <th>Qtd.</th>
                            <th>Estoque</th>
                            <th>Reservado</th>
                            <th>Motivo</th>
                            <th>Referência</th>
                            <th>Usuário</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhas}
                    </tbody>
                </table>
            </div>
        `;

        abrirModalHistoricoEstoque(html);

    } catch (error) {
        console.error("Erro ao carregar histórico de estoque:", error);
        showModal("Erro", "Falha de comunicação ao carregar histórico de estoque.", "error");
    }
};

// ==========================================
// 6. FORMULÁRIO DE CONTATO (REVENDEDOR)
// ==========================================
const formRevendedor = document.getElementById('form-revendedor');
if (formRevendedor) {
    formRevendedor.addEventListener('submit', (e) => {
        e.preventDefault();

        const nome = document.getElementById('rev-nome')?.value || '';
        const cidade = document.getElementById('rev-cidade')?.value || '';
        const telefone = document.getElementById('rev-telefone')?.value || '';
        const experiencia = document.getElementById('rev-experiencia')?.value || 'Não informado';
        const interesse = document.getElementById('rev-interesse')?.value || 'Não informado';

        const zapNumber = "5544999345231";

        const msg = `Olá, Balmantex! Tenho interesse em comprar tapetes da fábrica para revender.

*Dados para atendimento:*
👤 Nome: ${nome}
📍 Cidade/Estado: ${cidade}
📱 WhatsApp: ${telefone}
🛍️ Experiência: ${experiencia}
📦 Interesse: ${interesse}

Gostaria de receber o catálogo para revenda, modelos disponíveis, valores, quantidades e informações de envio.`;

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
// WCODE: CARREGAMENTO DINÂMICO DO MERCADO PAGO
// ==========================================
function carregarMercadoPagoSDK() {
    return new Promise((resolve, reject) => {
        if (window.MercadoPago) {
            resolve();
            return;
        }

        const existente = document.getElementById('mercadopago-sdk');
        if (existente) {
            existente.addEventListener('load', () => resolve(), { once: true });
            existente.addEventListener('error', () => reject(new Error('Falha ao carregar Mercado Pago SDK')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.id = 'mercadopago-sdk';
        script.src = 'https://sdk.mercadopago.com/js/v2';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Falha ao carregar Mercado Pago SDK'));
        document.head.appendChild(script);
    });
}

// ==========================================
// 8. PEDIDO VIA WHATSAPP
// ==========================================
const btnIniciarPagamento = document.getElementById('btn-iniciar-pagamento');
const brickContainer = document.getElementById('paymentBrick_container');

if (btnIniciarPagamento) {
    btnIniciarPagamento.textContent = 'Enviar pedido de revenda';

    btnIniciarPagamento.addEventListener('click', async () => {
        if (cart.length === 0) {
            showModal("Carrinho vazio", "Adicione pelo menos um produto ao carrinho antes de enviar o pedido.", "warning");
            return;
        }

        const token = localStorage.getItem('balmantex_client_token');
        if (!token) {
            showModal("Atenção", "Faça o login ou cadastre-se para enviar seu pedido para revenda pelo WhatsApp.", "warning", () => {
                window.location.href = 'login-cliente.html';
            });
            return;
        }

        const originalText = btnIniciarPagamento.textContent;
        btnIniciarPagamento.textContent = 'Montando pedido...';
        btnIniciarPagamento.style.opacity = '0.7';
        btnIniciarPagamento.disabled = true;
        btnIniciarPagamento.style.cursor = 'wait';

        try {
            const carrinhoParaPedido = cart.map(item => ({
                id: Number(item.id),
                quantity: Number(item.quantity || 1)
            }));

            const response = await fetch('/api/pedidos/whatsapp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    cart: carrinhoParaPedido,
                    valorFrete: window.valorFreteAtual || 0
                })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data.whatsapp_url) {
                if (response.status === 409 && Array.isArray(data.problemas)) {
                    const msg = data.problemas.map(p => p.erro || `${p.name}: estoque insuficiente`).join('<br>');
                    showModal("Estoque insuficiente", msg, "warning");
                } else {
                    showModal("Erro", data.error || "Não foi possível criar o pedido pelo WhatsApp.", "error");
                }

                btnIniciarPagamento.textContent = originalText;
                btnIniciarPagamento.style.opacity = '1';
                btnIniciarPagamento.disabled = false;
                btnIniciarPagamento.style.cursor = 'pointer';
                return;
            }

            localStorage.removeItem('balmantex_cart');
            cart = [];
            updateCartUI();

            showModal("Pedido criado!", `Seu pedido nº ${data.pedido_id} foi criado. Agora você será direcionado ao WhatsApp para confirmar modelos, quantidades, disponibilidade e envio.`, "success", () => {
                window.location.href = data.whatsapp_url;
            });

            setTimeout(() => {
                window.location.href = data.whatsapp_url;
            }, 900);

        } catch (error) {
            console.error("Erro ao criar pedido via WhatsApp:", error);
            showModal("Erro", "Falha de comunicação com o servidor.", "error");

            btnIniciarPagamento.textContent = originalText;
            btnIniciarPagamento.style.opacity = '1';
            btnIniciarPagamento.disabled = false;
            btnIniciarPagamento.style.cursor = 'pointer';
        }
    });
}


// ==========================================
// 9. EXPANSÃO DO PAINEL ADMIN (PEDIDOS E CLIENTES)
// ==========================================
const adminPedidosBody = document.getElementById('admin-pedidos-body');
const adminClientesBody = document.getElementById('admin-clientes-body');



// ==========================================
// WCODE: DETALHES DOS PEDIDOS NO ADMIN
// ==========================================
function parseItensPedidoSeguro(items) {
    if (Array.isArray(items)) return items;
    try {
        const parsed = JSON.parse(items || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function moedaPedidoBR(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function numeroPedidoBR(valor, casas = 3) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas
    });
}

function resumoItensPedido(items) {
    const itens = parseItensPedidoSeguro(items);
    const qtdTotal = itens.reduce((acc, item) => acc + Number(item.quantity || item.quantidade || 0), 0);
    const nomes = itens.slice(0, 2).map(item => item.name || item.nome || 'Produto').join(', ');
    const resto = itens.length > 2 ? ` +${itens.length - 2}` : '';

    if (!itens.length) return 'Sem itens';
    return `${qtdTotal} un. — ${nomes}${resto}`;
}

function montarEnderecoPedido(ped) {
    const partes = [
        [ped.cliente_rua, ped.cliente_numero].filter(Boolean).join(', '),
        ped.cliente_bairro,
        [ped.cliente_cidade, ped.cliente_estado].filter(Boolean).join('/'),
        ped.cliente_cep ? `CEP: ${ped.cliente_cep}` : ''
    ].filter(Boolean);

    return partes.length ? partes.join(' - ') : 'Endereço não informado';
}

function abrirModalDetalhesPedido(html) {
    const existente = document.getElementById('pedido-detalhes-overlay');
    if (existente) existente.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pedido-detalhes-overlay';
    overlay.className = 'pedido-detalhes-overlay';

    overlay.innerHTML = `
        <div class="pedido-detalhes-modal">
            <div class="pedido-detalhes-header">
                <h3>Detalhes do Pedido</h3>
                <button type="button" class="pedido-detalhes-fechar">&times;</button>
            </div>
            <div class="pedido-detalhes-body">
                ${html}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();
    overlay.querySelector('.pedido-detalhes-fechar').addEventListener('click', fechar);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) fechar();
    });
}

window.verDetalhesPedido = function(id) {
    const ped = (window.pedidosAdmin || []).find(p => Number(p.id) === Number(id));
    if (!ped) {
        showModal("Erro", "Pedido não encontrado na lista atual.", "error");
        return;
    }

    const itens = parseItensPedidoSeguro(ped.items);

    let subtotal = 0;
    let pesoTotal = 0;
    let volumeTotal = 0;

    const linhasItens = itens.map((item, index) => {
        const qtd = Number(item.quantity || item.quantidade || 0);
        const preco = Number(item.price || item.preco || 0);
        const totalItem = qtd * preco;
        const pesoItem = Number(item.peso || 0) * qtd;
        const volumeItem = Number(item.volume || 0) * qtd;

        subtotal += totalItem;
        pesoTotal += pesoItem;
        volumeTotal += volumeItem;

        return `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <strong>${item.name || item.nome || 'Produto'}</strong><br>
                    <small>${item.category || '-'} | ${item.size || '-'}</small>
                </td>
                <td style="text-align:center;">${qtd}</td>
                <td style="text-align:right;">${moedaPedidoBR(preco)}</td>
                <td style="text-align:right;">${moedaPedidoBR(totalItem)}</td>
            </tr>
        `;
    }).join('');

    const totalPedido = Number(ped.total || 0);
    const freteEstimado = Math.max(0, totalPedido - subtotal);

    const telefoneLimpo = String(ped.cliente_telefone || '').replace(/\D/g, '');
    const telefoneZap = telefoneLimpo ? (telefoneLimpo.startsWith('55') ? telefoneLimpo : '55' + telefoneLimpo) : '';
    const msgZap = encodeURIComponent(`Olá! Aqui é da Balmantex. Estou entrando em contato sobre o pedido nº ${ped.id}.`);
    const linkZap = telefoneZap ? `https://wa.me/${telefoneZap}?text=${msgZap}` : '';

    const html = `
        <div class="pedido-detalhes-grid">
            <div class="pedido-detalhes-card">
                <h4>Pedido</h4>
                <p><strong>Número:</strong> #${ped.id}</p>
                <p><strong>Status:</strong> ${ped.status || '-'}</p>
                <p><strong>Data:</strong> ${new Date(ped.data_criacao).toLocaleString('pt-BR')}</p>
                <p><strong>Total:</strong> ${moedaPedidoBR(totalPedido)}</p>
            </div>

            <div class="pedido-detalhes-card">
                <h4>Cliente</h4>
                <p><strong>Nome:</strong> ${ped.cliente_nome || '-'}</p>
                <p><strong>Telefone:</strong> ${ped.cliente_telefone || '-'}</p>
                <p><strong>E-mail:</strong> ${ped.cliente_email || '-'}</p>
                <p><strong>CPF/CNPJ:</strong> ${ped.cliente_cpf_cnpj || '-'}</p>
                ${linkZap ? `<a class="pedido-btn-zap" href="${linkZap}" target="_blank">💬 Chamar no WhatsApp</a>` : ''}
            </div>
        </div>

        <div class="pedido-detalhes-card">
            <h4>Endereço de entrega</h4>
            <p>${montarEnderecoPedido(ped)}</p>
        </div>

        <div class="pedido-detalhes-card">
            <h4>Itens do pedido</h4>
            <div style="overflow-x:auto;">
                <table class="pedido-itens-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Produto</th>
                            <th>Qtd.</th>
                            <th>Unitário</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhasItens || '<tr><td colspan="5" style="text-align:center;">Nenhum item encontrado.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="pedido-detalhes-grid">
            <div class="pedido-detalhes-card">
                <h4>Resumo financeiro</h4>
                <p><strong>Subtotal dos itens:</strong> ${moedaPedidoBR(subtotal)}</p>
                <p><strong>Frete estimado:</strong> ${moedaPedidoBR(freteEstimado)}</p>
                <p><strong>Total do pedido:</strong> ${moedaPedidoBR(totalPedido)}</p>
            </div>

            <div class="pedido-detalhes-card">
                <h4>Logística estimada</h4>
                <p><strong>Peso total:</strong> ${numeroPedidoBR(pesoTotal, 3)} kg</p>
                <p><strong>Volume total:</strong> ${numeroPedidoBR(volumeTotal, 3)} m³</p>
            </div>
        </div>
    `;

    abrirModalDetalhesPedido(html);
};

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
        window.pedidosAdmin = pedidos;
        
        adminPedidosBody.innerHTML = '';
        if (pedidos.length === 0) {
            adminPedidosBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Nenhum pedido realizado ainda.</td></tr>';
            return;
        }

        pedidos.forEach(ped => {
            const dataData = new Date(ped.data_criacao).toLocaleDateString('pt-BR');
            const valorTotal = parseFloat(ped.total).toFixed(2).replace('.', ',');
            const resumoItens = resumoItensPedido(ped.items);
            
            let statusColor = '#7A7A7A';
            if(ped.status.includes('Pago')) statusColor = 'var(--whatsapp-green)';
            if(ped.status.includes('WhatsApp')) statusColor = 'var(--primary-color)';
            if(ped.status.includes('Recusado')) statusColor = '#e74c3c';
            if(ped.status.includes('Enviado')) statusColor = '#3498db';

            let acaoHtml = `<br><button onclick="verDetalhesPedido(${ped.id})" style="margin-top:8px;background:#333;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.75rem;">🔎 Ver Detalhes</button>`;
            const telefoneCliente = String(ped.cliente_telefone || '').replace(/\D/g, '');
            const telefoneWhatsApp = telefoneCliente.startsWith('55') ? telefoneCliente : '55' + telefoneCliente;

            if (ped.status.includes('WhatsApp') && telefoneCliente) {
                const msgAtendimento = encodeURIComponent(`Olá! Aqui é da Balmantex. Recebemos seu pedido nº ${ped.id} e vamos continuar seu atendimento por aqui.`);
                acaoHtml += `<br><a href="https://wa.me/${telefoneWhatsApp}?text=${msgAtendimento}" target="_blank" style="display:inline-block;margin-top:8px;background:var(--whatsapp-green);color:white;text-decoration:none;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.75rem;">💬 Atender no WhatsApp</a>`;
            } else if (ped.status.includes('Pago e Confirmado')) {
                acaoHtml += `<br><button onclick="atualizarRastreio(${ped.id})" style="margin-top: 8px; background: #3498db; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.75rem;">📦 Informar Rastreio</button>`;
            } else if (ped.rastreio) {
                acaoHtml += `<br><small style="color: #3498db; font-weight: bold; display:inline-block; margin-top: 5px;">Rastreio: ${ped.rastreio}</small>`;
            }

            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid #EAEAEA";
            tr.innerHTML = `
                <td style="padding: 15px;"><strong>#${ped.id}</strong></td>
                <td style="padding: 15px;">${ped.cliente_nome || '-'}<br><small style="color: #888;">${ped.cliente_telefone || '-'}</small></td>
                <td style="padding: 15px; max-width: 260px;">
                    <span style="font-size:0.9rem;">${resumoItens}</span><br>
                    <button onclick="verDetalhesPedido(${ped.id})" style="margin-top:6px;background:#333;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.75rem;">🔎 Ver pedido</button>
                </td>
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
    if (typeof carregarRelatoriosAdmin === 'function') carregarRelatoriosAdmin();
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


// === WCODE: OTIMIZACAO IMAGENS INDEX ===
(function () {
  function otimizarImagem(img) {
    if (!img || img.dataset.wcodeImgOptimizada === "1") return;

    const src = img.getAttribute("src") || "";
    const classe = img.className || "";
    const alt = img.getAttribute("alt") || "";

    const pareceLogo = src.includes("logo") || classe.toLowerCase().includes("logo") || alt.toLowerCase().includes("logo");
    const pareceHero = src.includes("fundo-hero");

    if (!pareceLogo && !pareceHero) {
      img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");
    }

    img.dataset.wcodeImgOptimizada = "1";
  }

  function aplicarOtimizacao() {
    document.querySelectorAll("img").forEach(otimizarImagem);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", aplicarOtimizacao);
  } else {
    aplicarOtimizacao();
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!node) return;

        if (node.tagName === "IMG") {
          otimizarImagem(node);
        }

        if (node.querySelectorAll) {
          node.querySelectorAll("img").forEach(otimizarImagem);
        }
      });
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();




// ==========================================
// WCODE: FILTROS INSTANTÂNEOS DO ADMIN
// ==========================================
function normalizarBuscaAdmin(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function aplicarFiltroTabelaAdmin(inputId, tbodyId, contadorId) {
    const input = document.getElementById(inputId);
    const tbody = document.getElementById(tbodyId);
    const contador = document.getElementById(contadorId);

    if (!input || !tbody) return;

    const termo = normalizarBuscaAdmin(input.value);
    const noResultId = `${tbodyId}-sem-resultados`;

    let noResult = document.getElementById(noResultId);
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(row => row.id !== noResultId);

    let total = 0;
    let visiveis = 0;

    rows.forEach(row => {
        total += 1;

        const texto = normalizarBuscaAdmin(row.innerText || row.textContent || '');
        const aparece = !termo || texto.includes(termo);

        row.style.display = aparece ? '' : 'none';
        if (aparece) visiveis += 1;
    });

    if (!noResult) {
        noResult = document.createElement('tr');
        noResult.id = noResultId;
        noResult.className = 'admin-filtro-sem-resultado';
        noResult.innerHTML = `<td colspan="12" style="text-align:center; padding: 24px; color:#7A7A7A;">Nenhum resultado encontrado para a busca.</td>`;
        tbody.appendChild(noResult);
    }

    noResult.style.display = termo && total > 0 && visiveis === 0 ? '' : 'none';

    if (contador) {
        if (total === 0) {
            contador.textContent = '0 registros';
        } else if (termo) {
            contador.textContent = `${visiveis} de ${total} registro(s)`;
        } else {
            contador.textContent = `${total} registro(s)`;
        }
    }
}

function iniciarFiltroTabelaAdmin(inputId, tbodyId, contadorId) {
    const input = document.getElementById(inputId);
    const tbody = document.getElementById(tbodyId);

    if (!input || !tbody || input.dataset.filtroAdminAtivo === '1') return;

    input.dataset.filtroAdminAtivo = '1';

    const aplicar = () => aplicarFiltroTabelaAdmin(inputId, tbodyId, contadorId);

    input.addEventListener('input', aplicar);
    input.addEventListener('search', aplicar);

    const observer = new MutationObserver(() => {
        clearTimeout(tbody._filtroAdminTimer);
        tbody._filtroAdminTimer = setTimeout(aplicar, 80);
    });

    observer.observe(tbody, {
        childList: true,
        subtree: false
    });

    aplicar();
}

function configurarFiltrosAdmin() {
    iniciarFiltroTabelaAdmin('filtro-estoque-admin', 'admin-table-body', 'contador-estoque-admin');
    iniciarFiltroTabelaAdmin('filtro-pedidos-admin', 'admin-pedidos-body', 'contador-pedidos-admin');
    iniciarFiltroTabelaAdmin('filtro-clientes-admin', 'admin-clientes-body', 'contador-clientes-admin');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', configurarFiltrosAdmin);
} else {
    configurarFiltrosAdmin();
}




// ==========================================
// WCODE: RELATÓRIOS ADMIN
// ==========================================
function relatorioMoedaBR(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function relatorioDataBR(valor) {
    if (!valor) return 'Nunca';
    try {
        return new Date(valor).toLocaleDateString('pt-BR');
    } catch (e) {
        return valor;
    }
}

function relatorioNumero(valor) {
    return Number(valor || 0).toLocaleString('pt-BR');
}

function relatorioLinhaVazia(colspan, texto) {
    return `<tr><td colspan="${colspan}" style="text-align:center; padding: 24px; color:#777;">${texto}</td></tr>`;
}

async function carregarRelatoriosAdmin() {
    const resumoBox = document.getElementById('relatorios-resumo');
    const produtosBody = document.getElementById('relatorio-produtos-vendidos-body');
    const clientesBody = document.getElementById('relatorio-clientes-body');
    const paradosBody = document.getElementById('relatorio-parados-body');

    if (!resumoBox || !produtosBody || !clientesBody || !paradosBody) return;

    resumoBox.innerHTML = '<div class="relatorio-loading">Carregando relatórios...</div>';
    produtosBody.innerHTML = relatorioLinhaVazia(5, 'Carregando...');
    clientesBody.innerHTML = relatorioLinhaVazia(6, 'Carregando...');
    paradosBody.innerHTML = relatorioLinhaVazia(6, 'Carregando...');

    try {
        const response = await fetch('/api/admin/relatorios', {
            headers: { 'Authorization': 'Bearer ' + sessionStorage.getItem('admin_token') }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erro ao carregar relatórios.');
        }

        const resumo = data.resumo || {};

        resumoBox.innerHTML = `
            <div class="relatorio-card">
                <span>Pedidos considerados</span>
                <strong>${relatorioNumero(resumo.pedidos_considerados)}</strong>
            </div>
            <div class="relatorio-card">
                <span>Receita estimada</span>
                <strong>${relatorioMoedaBR(resumo.receita_total)}</strong>
            </div>
            <div class="relatorio-card">
                <span>Unidades vendidas</span>
                <strong>${relatorioNumero(resumo.unidades_vendidas)}</strong>
            </div>
            <div class="relatorio-card">
                <span>Clientes com pedidos</span>
                <strong>${relatorioNumero(resumo.clientes_com_pedidos)}</strong>
            </div>
            <div class="relatorio-card">
                <span>Produtos com estoque</span>
                <strong>${relatorioNumero(resumo.produtos_com_estoque)}</strong>
            </div>
            <div class="relatorio-card destaque">
                <span>Valor em estoque</span>
                <strong>${relatorioMoedaBR(resumo.valor_total_estoque_disponivel)}</strong>
            </div>
        `;

        const produtos = data.produtosMaisVendidos || [];
        produtosBody.innerHTML = produtos.length ? produtos.map((p, index) => `
            <tr>
                <td>
                    <strong>${index + 1}. ${p.name || '-'}</strong><br>
                    <small>ID: ${p.id || '-'}</small>
                </td>
                <td>${p.category || '-'}<br><small>${p.size || '-'}</small></td>
                <td><strong>${relatorioNumero(p.quantidade)}</strong></td>
                <td>${relatorioMoedaBR(p.receita)}</td>
                <td>${relatorioDataBR(p.ultima_venda)}</td>
            </tr>
        `).join('') : relatorioLinhaVazia(5, 'Ainda não há vendas suficientes para montar este ranking.');

        const clientes = data.clientesMaisCompram || [];
        clientesBody.innerHTML = clientes.length ? clientes.map((c, index) => `
            <tr>
                <td>
                    <strong>${index + 1}. ${c.nome || '-'}</strong><br>
                    <small>${c.cidade || '-'} ${c.estado ? '/ ' + c.estado : ''}</small>
                </td>
                <td>${c.telefone || '-'}<br><small>${c.email || '-'}</small></td>
                <td><strong>${relatorioNumero(c.pedidos)}</strong></td>
                <td>${relatorioNumero(c.unidades)}</td>
                <td>${relatorioMoedaBR(c.total)}</td>
                <td>${relatorioDataBR(c.ultima_compra)}</td>
            </tr>
        `).join('') : relatorioLinhaVazia(6, 'Ainda não há clientes com pedidos registrados.');

        const parados = data.produtosParados || [];
        paradosBody.innerHTML = parados.length ? parados.map((p, index) => {
            const nunca = !p.ultima_venda;
            return `
                <tr>
                    <td>
                        <strong>${index + 1}. ${p.name || '-'}</strong><br>
                        <small>ID: ${p.id || '-'}</small>
                    </td>
                    <td>${p.category || '-'}<br><small>${p.size || '-'}</small></td>
                    <td><strong>${relatorioNumero(p.estoque_disponivel)}</strong> un.</td>
                    <td>${relatorioMoedaBR(p.valor_parado)}</td>
                    <td>${relatorioDataBR(p.ultima_venda)}</td>
                    <td><span class="relatorio-status ${nunca ? 'alerta' : ''}">${nunca ? 'Nunca vendido' : 'Vendido anteriormente'}</span></td>
                </tr>
            `;
        }).join('') : relatorioLinhaVazia(6, 'Nenhum produto parado encontrado.');

    } catch (error) {
        console.error('Erro ao carregar relatórios:', error);
        resumoBox.innerHTML = `<div class="relatorio-loading erro">Erro ao carregar relatórios.</div>`;
        produtosBody.innerHTML = relatorioLinhaVazia(5, 'Erro ao carregar dados.');
        clientesBody.innerHTML = relatorioLinhaVazia(6, 'Erro ao carregar dados.');
        paradosBody.innerHTML = relatorioLinhaVazia(6, 'Erro ao carregar dados.');
    }
}

const btnAtualizarRelatorios = document.getElementById('btn-atualizar-relatorios');
if (btnAtualizarRelatorios) {
    btnAtualizarRelatorios.addEventListener('click', carregarRelatoriosAdmin);
}

