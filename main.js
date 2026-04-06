// Price Hunt Main Application Logic

let allProducts = [];
let filteredProducts = [];
let storesMap = {};
const MAJOR_STORES = ['Flipkart', 'Amazon', 'Croma', 'Reliance Digital', 'JioMart', 'TataCliq', 'Vijay Sales'];

// Constants
const API_URL = './final_mobile_comparison.json';
const STORE_DATA_URL = './store_id.csv';

// Elements
const productGrid = document.getElementById('productGrid');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const brandFilter = document.getElementById('brandFilter');
const ramFilter = document.getElementById('ramFilter');
const storageFilter = document.getElementById('storageFilter');
const minPrice = document.getElementById('minPrice');
const maxPrice = document.getElementById('maxPrice');
const sortOrder = document.getElementById('sortOrder');
const modelCount = document.getElementById('modelCount');
const resultsTitle = document.getElementById('resultsTitle');

// Modal Elements
const modal = document.getElementById('productModal');
const modalBody = document.getElementById('modalBody');
const closeModal = document.querySelector('.close-modal');

// --- Data Loading ---

async function init() {
    try {
        const [productsResponse, storesResponse] = await Promise.all([
            fetch(API_URL),
            fetch(STORE_DATA_URL)
        ]);

        const rawData = await productsResponse.json();

        const csvData = await storesResponse.text();
        parseStoreCSV(csvData);

        allProducts = unifyProducts(rawData);
        populateFilters();
        renderProducts(allProducts);
        updateStats(allProducts.length);

        setupEventListeners();
    } catch (error) {
        console.error('Error initializing app:', error);
        if (productGrid) {
            productGrid.innerHTML = `<div class="error">Failed to load data. Please check if the JSON and CSV files exist.</div>`;
        }
    }
}

function unifyProducts(data) {
    const unified = {};
    if (!data || !Array.isArray(data)) return [];
    
    const allowedRAM = [2, 3, 4, 6, 8, 12, 16, 18, 24];
    const allowedStorage = [32, 64, 128, 256, 512, 1024];

    data.forEach(group => {
        if (!group.all_listings) return;
        
        group.all_listings.forEach(listing => {
            let title = listing.title.toLowerCase();
            
            // 1. Extract Config (RAM/Storage)
            let ram = group.ram_gb;
            let storage = group.storage_gb;

            // Pattern for "8/128" or similar
            const configMatch = title.match(/\b(\d+)\s*[\\/|+\-]\s*(\d+)\b/);
            if (configMatch) {
                let v1 = parseInt(configMatch[1]);
                let v2 = parseInt(configMatch[2]);
                if (allowedRAM.includes(v1) && allowedStorage.includes(v2)) {
                    ram = v1; storage = v2;
                } else if (allowedRAM.includes(v2) && allowedStorage.includes(v1)) {
                    ram = v2; storage = v1;
                }
            } else {
                const ramM = title.match(/\b(\d+)\s*(gb|ram)\b/i);
                if (ramM) {
                    let v = parseInt(ramM[1]);
                    if (allowedRAM.includes(v)) ram = v;
                }
                
                const storageM = title.match(/\b(\d+)\s*(gb|tb|storage)\b/ig);
                if (storageM) {
                    let sizes = storageM.map(m => parseInt(m)).filter(s => allowedStorage.includes(s));
                    if (sizes.length > 0) storage = Math.max(...sizes);
                }
            }

            // 2. Clean the name
            let name = title;
            
            // Remove technical units
            name = name.replace(/\d+\s*(hz|watt|w|mah|mp|mpix|pixels|inch|")\b/gi, ' ');
            name = name.replace(/\d+\.\d+\s*(inch|")?\b/gi, ' '); 
            
            // Remove processors and specific chipset numbers
            name = name.replace(/\b(dimensity|snapdragon|helio|mtk|octa|core|processor|gen\s*\d+|unisoc)\b/gi, ' ');
            name = name.replace(/\b(6300|7050|1080|8000|7200|6100|6000|5000|120|90|45|33|18|67|68|69)\b/g, ' ');

            // Remove standalone spec words
            name = name.replace(/\d+\s*(gb|ram|storage|tb|mb)\b/gi, ' ');

            // Remove brand
            const brandStr = group.brand?.toLowerCase() || '';
            if (brandStr) name = name.replace(new RegExp(`\\b${brandStr}\\b`, 'gi'), ' ');

            // Exhaustive Noise and Color removal
            const noise = [
                'obsidian', 'hazel', 'porcelain', 'bay', 'mint', 'lavender', 'fog', 'sky', 'charcoal', 'chalk', 'sage', 'lemongrass',
                'titanium', 'natural', 'blue', 'green', 'red', 'yellow', 'purple', 'pink', 'orange', 'brown', 'black', 'white', 'silver', 'gold', 'grey', 'gray',
                'cobalt', 'violet', 'jetblack', 'whitesilver', 'silverblue', 'jadegreen', 'navy', 'light', 'with', 'other', 'offers', 'phantom',
                'icy', 'prism', 'desert', 'space', 'sunset', 'midnight', 'starlight', 'ice', 'sapphire', 'diamond', 'crystal', 'pearl',
                'passion', 'lemon', 'no', 'cost', 'emi', 'additional', 'exchange', 'extra', 'off', 'discount', 'cashback', 'bonus', 'limited', 'edition', 'exclusive',
                'smartphone', 'mobile', 'phone', 'original', 'official', 'warranty', 'sealed', 'box', 'new', '5g', '4g', 'lte', 'volte',
                'golden', 'glow', 'glory', 'suit', 'marine', 'silk', 'flowing', 'velvet', 'icesense', 'bikaner', 'suede', 'rose',
                'jewel', 'jwel', 'crystal', 'black', 'red', 'gold', 'silver', 'green', 'blue', 'white', 'hd', 'fhd', 'ram', 'storage', 'gb', 'processor', 'ip69', 'ip68', 'ip'
            ];
            const noiseRegex = new RegExp(`\\b(${noise.join('|')})\\b`, 'gi');
            name = name.replace(noiseRegex, ' ');

            // Final normalization
            name = name.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
            const words = name.split(' ').filter(s => s.length > 0).sort();
            const sortedName = words.join(' ');

            const brandKey = group.brand?.toLowerCase() || 'unknown';
            const key = `${brandKey}-${sortedName}-${ram}-${storage}`;

            if (!unified[key]) {
                unified[key] = {
                    group_id: key,
                    canonical_name: words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                    brand: group.brand || 'Unknown',
                    ram_gb: ram,
                    storage_gb: storage,
                    best_price_inr: listing.price,
                    stores_count: 0,
                    available_at: '',
                    all_listings: []
                };
            }
            
            unified[key].all_listings.push(listing);
            if (listing.price > 0 && (listing.price < unified[key].best_price_inr || unified[key].best_price_inr === 0)) {
                unified[key].best_price_inr = listing.price;
            }
        });
    });

    Object.values(unified).forEach(product => {
        const availableListings = product.all_listings.filter(l => l.price > 0);
        const stores = [...new Set(availableListings.map(l => l.store))];
        product.stores_count = stores.length;
        product.available_at = stores.join(', ');
    });

    return Object.values(unified);
}

function parseStoreCSV(csv) {
    const lines = csv.split('\n');
    if (lines.length === 0) return;
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = [];
        let current = '';
        let inQuotes = false;

        for (let char of lines[i]) {
            if (char === '"' && !inQuotes) inQuotes = true;
            else if (char === '"' && inQuotes) inQuotes = false;
            else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current);

        const store = {};
        headers.forEach((header, index) => {
            store[header] = values[index]?.replace(/^"|"$/g, '').trim() || '';
        });

        if (store.site_id) {
            storesMap[store.site_id] = store;
        }
    }
}

function populateFilters() {
    const brands = new Set();
    const rams = new Set();
    const storages = new Set();

    allProducts.forEach(p => {
        if (p.brand) brands.add(p.brand);
        if (p.ram_gb) rams.add(p.ram_gb);
        if (p.storage_gb) storages.add(p.storage_gb);
    });

    if (brandFilter) {
        brandFilter.innerHTML = '<option value="all">All Brands</option>';
        Array.from(brands).sort().forEach(brand => {
            const option = document.createElement('option');
            option.value = brand;
            option.textContent = brand;
            brandFilter.appendChild(option);
        });
    }

    if (ramFilter) {
        ramFilter.innerHTML = '';
        renderOptionGroup(ramFilter, Array.from(rams).sort((a, b) => a - b), 'ram');
    }
    if (storageFilter) {
        storageFilter.innerHTML = '';
        renderOptionGroup(storageFilter, Array.from(storages).sort((a, b) => a - b), 'storage');
    }
}

function renderOptionGroup(container, options, type) {
    options.forEach(opt => {
        const btn = document.createElement('div');
        btn.className = 'filter-option';
        btn.dataset.type = type;
        btn.dataset.value = opt;
        btn.textContent = `${opt} GB`;
        btn.onclick = () => {
            btn.classList.toggle('active');
            applyFilters();
        };
        container.appendChild(btn);
    });
}

function applyFilters() {
    const query = searchInput.value.toLowerCase();
    const selectedBrand = brandFilter.value;
    const activeRams = Array.from(document.querySelectorAll('.filter-option[data-type="ram"].active')).map(el => parseInt(el.dataset.value));
    const activeStorages = Array.from(document.querySelectorAll('.filter-option[data-type="storage"].active')).map(el => parseInt(el.dataset.value));
    const minP = parseFloat(minPrice.value) || 0;
    const maxP = parseFloat(maxPrice.value) || Infinity;

    filteredProducts = allProducts.filter(p => {
        const matchesQuery = !query || p.canonical_name.toLowerCase().includes(query) || p.brand.toLowerCase().includes(query);
        const matchesBrand = selectedBrand === 'all' || p.brand === selectedBrand;
        const matchesRam = activeRams.length === 0 || activeRams.includes(p.ram_gb);
        const matchesStorage = activeStorages.length === 0 || activeStorages.includes(p.storage_gb);
        const matchesPrice = p.best_price_inr >= minP && p.best_price_inr <= maxP;

        return matchesQuery && matchesBrand && matchesRam && matchesStorage && matchesPrice;
    });

    sortProducts();
    renderProducts(filteredProducts);
    updateStats(filteredProducts.length);
    resultsTitle.textContent = query ? `Search results for "${query}"` : 'Filtered Mobiles';
}

function sortProducts() {
    const order = sortOrder.value;
    filteredProducts.sort((a, b) => {
        if (order === 'price-asc') return a.best_price_inr - b.best_price_inr;
        if (order === 'price-desc') return b.best_price_inr - a.best_price_inr;
        if (order === 'name') return a.canonical_name.localeCompare(b.canonical_name);
        return 0;
    });
}

function renderProducts(products) {
    productGrid.innerHTML = '';

    if (products.length === 0) {
        productGrid.innerHTML = `<div class="loading-state">No products found matching your criteria.</div>`;
        return;
    }

    products.forEach((product, index) => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.style.animationDelay = `${(index % 12) * 0.05}s`;

        const firstListing = product.all_listings[0] || {};
        const imgUrl = firstListing.img || 'https://via.placeholder.com/200?text=No+Image';

        const availableStoreNames = [...new Set(product.all_listings.filter(l => l.price > 0).map(l => l.store))];
        const unavailableStoresCount = MAJOR_STORES.filter(s => !availableStoreNames.includes(s)).length;
        const totalCount = availableStoreNames.length + unavailableStoresCount;

        card.innerHTML = `
            <div class="brand-badge">${product.brand}</div>
            <div class="card-image-wrap">
                <img src="${imgUrl}" alt="${product.canonical_name}" loading="lazy">
            </div>
            <div class="product-info">
                <h3>${product.canonical_name}</h3>
                <div class="specs">
                    ${product.ram_gb ? `<div class="spec-item"><span>🚀</span> ${product.ram_gb}GB RAM</div>` : ''}
                    ${product.storage_gb ? `<div class="spec-item"><span>💾</span> ${product.storage_gb}GB</div>` : ''}
                </div>
                <div class="price-row">
                    <div class="best-price">₹${product.best_price_inr.toLocaleString()}</div>
                    <button class="view-stores" data-id="${product.group_id}">Compare ${totalCount} Stores</button>
                </div>
            </div>
        `;

        card.querySelector('.view-stores').onclick = () => showProductDetails(product);
        productGrid.appendChild(card);
    });
}

function updateStats(count) {
    if (modelCount) modelCount.textContent = `${count} models found`;
}

function showProductDetails(product) {
    const firstListing = product.all_listings[0] || {};
    const imgUrl = firstListing.img || 'https://via.placeholder.com/200?text=No+Image';
    
    const availableListings = product.all_listings.filter(l => l.price > 0);
    const availableStoreNames = availableListings.map(l => l.store);
    const unavailableStores = MAJOR_STORES.filter(s => !availableStoreNames.includes(s));

    let storeHtml = availableListings.map(item => {
        const storeInfo = storesMap[item.storeId] || {};
        const favicon = storeInfo.favicon || `https://www.google.com/s2/favicons?sz=64&domain=${item.store.toLowerCase().replace(' ', '')}.com`;

        return `
            <div class="store-item-detailed">
                <div class="listing-thumb">
                    <img src="${item.img || 'https://via.placeholder.com/150'}" alt="Listing image">
                </div>
                <div class="listing-main">
                    <div class="store-name-row">
                        <img src="${favicon}" class="store-logo" alt="${item.store}">
                        <span class="store-name-text">${item.store}</span>
                    </div>
                    <div class="listing-title-full">${item.title}</div>
                    <div class="listing-tags">
                        ${item.color ? `<span class="tag-color">🎨 ${item.color}</span>` : ''}
                        ${item.rating ? `<span class="tag-rating">⭐ ${item.rating} (${item.ratingCount || 0})</span>` : ''}
                    </div>
                </div>
                <div class="listing-price-actions">
                    <div class="listing-price-info">
                        <div class="price-val">₹${item.price.toLocaleString()}</div>
                        ${item.discount ? `<div class="discount-label">${item.discount}% OFF</div>` : ''}
                        ${item.mrp > item.price ? `<div class="mrp-strikethrough">₹${item.mrp.toLocaleString()}</div>` : ''}
                    </div>
                    <a href="${item.url}" target="_blank" class="buy-btn-premium">Buy Now</a>
                </div>
            </div>
        `;
    }).join('');

    storeHtml += unavailableStores.map(storeName => {
        const favicon = `https://www.google.com/s2/favicons?sz=64&domain=${storeName.toLowerCase().replace(' ', '')}.com`;
        return `
            <div class="store-item-detailed unavailable">
                <div class="listing-thumb">
                    <img src="${imgUrl}" alt="${product.canonical_name}">
                </div>
                <div class="listing-main">
                    <div class="store-name-row">
                        <img src="${favicon}" class="store-logo" alt="${storeName}">
                        <span class="store-name-text">${storeName}</span>
                    </div>
                    <div class="listing-title-full">${product.canonical_name}</div>
                    <div class="listing-tags">
                        ${product.ram_gb ? `<span class="tag-spec">🚀 ${product.ram_gb}GB</span>` : ''}
                        ${product.storage_gb ? `<span class="tag-spec">💾 ${product.storage_gb}GB</span>` : ''}
                        <span class="tag-status">⏳ Out of Stock</span>
                    </div>
                </div>
                <div class="listing-price-actions">
                    <div class="listing-price-info">
                        <div class="price-val">--</div>
                    </div>
                    <button class="buy-btn-premium disabled" disabled>Out of Stock</button>
                </div>
            </div>
        `;
    }).join('');

    modalBody.innerHTML = `
        <div class="modal-header">
            <div class="modal-img-wrap">
                <img src="${imgUrl}" alt="${product.canonical_name}">
            </div>
            <div class="modal-title-info">
                <h2>${product.canonical_name}</h2>
                <div class="brand-name" style="color: var(--text-accent); font-weight: 600; margin-bottom: 0.5rem">${product.brand}</div>
                <div class="specs" style="margin-top: 1rem">
                    ${product.ram_gb ? `<div class="spec-item">${product.ram_gb}GB RAM</div>` : ''}
                    ${product.storage_gb ? `<div class="spec-item">${product.storage_gb}GB STORAGE</div>` : ''}
                </div>
            </div>
        </div>
        <div class="comparison-section">
            <h3 style="margin-bottom: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 0.75rem;">
                <span style="color: var(--success)">${availableListings.length} Available</span> 
                <span style="color: var(--text-secondary); margin-left: 1rem;">${unavailableStores.length} Unavailable</span>
            </h3>
            <div class="store-list">
                ${storeHtml}
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function setupEventListeners() {
    if (searchBtn) searchBtn.onclick = applyFilters;
    if (searchInput) searchInput.onkeyup = (e) => { if (e.key === 'Enter') applyFilters(); };
    if (brandFilter) brandFilter.onchange = applyFilters;
    if (sortOrder) sortOrder.onchange = applyFilters;
    if (minPrice) minPrice.oninput = applyFilters;
    if (maxPrice) maxPrice.oninput = applyFilters;

    if (closeModal) {
        closeModal.onclick = () => {
            modal.classList.add('hidden');
            document.body.style.overflow = 'auto';
        };
    }

    window.onclick = (event) => {
        if (event.target.classList.contains('modal-overlay')) {
            modal.classList.add('hidden');
            document.body.style.overflow = 'auto';
        }
    };
}

init();
