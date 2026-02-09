// ============================================
// TagihWarga PWA - Main Application Logic
// ============================================

// --------------------------------------------------
// 🔧 SUPABASE CONFIG — Ganti dengan kredensial kamu
// --------------------------------------------------
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --------------------------------------------------
// 📌 CONSTANTS
// --------------------------------------------------
const PROOF_EXPIRY_DAYS = 40;
const MONTH_NAMES = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

// --------------------------------------------------
// 📦 STATE
// --------------------------------------------------
const State = {
    customers: [],
    payments: [],
    villages: [],
    selectedVillage: null,
    selectedMonth: new Date(), // tracks current viewed month
    filter: 'unpaid',         // 'unpaid' | 'all'
    selectedPhotoFile: null,
};

// --------------------------------------------------
// 🚀 APP MODULE
// --------------------------------------------------
const App = {

    // ============ INIT ============
    async init() {
        this.updateMonthDisplay();
        this.setupOnlineStatus();
        await this.loadCustomers();
        this.renderVillages();
        this.showEmptyState();
    },

    // ============ ONLINE STATUS ============
    setupOnlineStatus() {
        const dot = document.getElementById('onlineStatus');
        const updateStatus = () => {
            dot.classList.toggle('bg-green-400', navigator.onLine);
            dot.classList.toggle('bg-red-400', !navigator.onLine);
            dot.title = navigator.onLine ? 'Online' : 'Offline (data dari cache)';
        };
        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
        updateStatus();
    },

    // ============ DATA LOADING ============
    async loadCustomers() {
        try {
            const { data, error } = await supabase
                .from('customers')
                .select('*')
                .order('name');

            if (error) throw error;

            State.customers = data || [];

            // Cache to localStorage for offline access
            localStorage.setItem('tagihwarga_customers', JSON.stringify(State.customers));
            localStorage.setItem('tagihwarga_cache_time', new Date().toISOString());

        } catch (err) {
            console.warn('Fetch customers failed, loading from cache:', err.message);
            const cached = localStorage.getItem('tagihwarga_customers');
            if (cached) {
                State.customers = JSON.parse(cached);
                this.showToast('⚠️ Offline — data dari cache');
            } else {
                this.showToast('❌ Gagal memuat data');
            }
        }

        // Extract unique villages
        State.villages = [...new Set(State.customers.map(c => c.village))].sort();
    },

    async loadPayments() {
        const monthYear = this.getMonthYear();
        try {
            const { data, error } = await supabase
                .from('payments')
                .select('*')
                .eq('month_year', monthYear);

            if (error) throw error;
            State.payments = data || [];

            // Cache payments per month
            localStorage.setItem(`tagihwarga_payments_${monthYear}`, JSON.stringify(State.payments));

        } catch (err) {
            console.warn('Fetch payments failed, loading from cache:', err.message);
            const cached = localStorage.getItem(`tagihwarga_payments_${monthYear}`);
            State.payments = cached ? JSON.parse(cached) : [];
        }
    },

    // ============ MONTH NAVIGATION ============
    getMonthYear() {
        const d = State.selectedMonth;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    },

    updateMonthDisplay() {
        const d = State.selectedMonth;
        document.getElementById('monthDisplay').textContent =
            `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    },

    changeMonth(delta) {
        State.selectedMonth.setMonth(State.selectedMonth.getMonth() + delta);
        this.updateMonthDisplay();
        if (State.selectedVillage) {
            this.selectVillage(State.selectedVillage);
        }
    },

    showMonthPicker() {
        // Simple prompt-based picker for MVP
        const input = prompt(
            'Masukkan bulan & tahun (format: YYYY-MM)',
            this.getMonthYear()
        );
        if (input && /^\d{4}-\d{2}$/.test(input)) {
            const [y, m] = input.split('-').map(Number);
            State.selectedMonth = new Date(y, m - 1, 1);
            this.updateMonthDisplay();
            if (State.selectedVillage) {
                this.selectVillage(State.selectedVillage);
            }
        }
    },

    // ============ VILLAGE SELECTION ============
    renderVillages() {
        const container = document.getElementById('villageButtons');

        if (State.villages.length === 0) {
            container.innerHTML = `
                <p class="text-sm text-gray-400 py-2">Belum ada data desa.</p>
            `;
            return;
        }

        container.innerHTML = State.villages.map(village => `
            <button
                onclick="App.selectVillage('${village.replace(/'/g, "\\'")}')"
                data-village="${village}"
                class="village-btn flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all
                    border-gray-200 bg-white text-gray-600 hover:border-blue-400 active:scale-95"
            >
                🏘️ ${village}
            </button>
        `).join('');
    },

    async selectVillage(village) {
        State.selectedVillage = village;

        // Update button styles
        document.querySelectorAll('.village-btn').forEach(btn => {
            const isActive = btn.dataset.village === village;
            btn.classList.toggle('border-blue-500', isActive);
            btn.classList.toggle('bg-blue-50', isActive);
            btn.classList.toggle('text-blue-700', isActive);
            btn.classList.toggle('border-gray-200', !isActive);
            btn.classList.toggle('bg-white', !isActive);
            btn.classList.toggle('text-gray-600', !isActive);
        });

        document.getElementById('headerSubtitle').textContent = village;

        // Show loading
        document.getElementById('customerList').innerHTML = `
            <div class="skeleton h-20 rounded-xl"></div>
            <div class="skeleton h-20 rounded-xl"></div>
        `;

        await this.loadPayments();
        this.renderCustomerList();

        // Show filter & stats
        document.getElementById('filterTabs').classList.remove('hidden');
        document.getElementById('statsBar').classList.remove('hidden');
        document.getElementById('emptyState').classList.add('hidden');
    },

    // ============ FILTER ============
    setFilter(filter) {
        State.filter = filter;

        const btnUnpaid = document.getElementById('filterUnpaid');
        const btnAll = document.getElementById('filterAll');

        if (filter === 'unpaid') {
            btnUnpaid.className = 'flex-1 py-2 text-sm font-semibold rounded-lg transition-all bg-white text-red-600 shadow-sm';
            btnAll.className = 'flex-1 py-2 text-sm font-semibold rounded-lg transition-all text-gray-500';
        } else {
            btnAll.className = 'flex-1 py-2 text-sm font-semibold rounded-lg transition-all bg-white text-blue-600 shadow-sm';
            btnUnpaid.className = 'flex-1 py-2 text-sm font-semibold rounded-lg transition-all text-gray-500';
        }

        this.renderCustomerList();
    },

    // ============ RENDER CUSTOMER LIST ============
    renderCustomerList() {
        const container = document.getElementById('customerList');

        // Filter customers by selected village
        const villageCustomers = State.customers.filter(
            c => c.village === State.selectedVillage
        );

        // Map each customer with their payment status
        const enriched = villageCustomers.map(customer => {
            const payment = State.payments.find(p => p.customer_id === customer.id);
            return {
                ...customer,
                payment,
                isPaid: !!payment,
            };
        });

        // Update stats
        const paidCount = enriched.filter(c => c.isPaid).length;
        const unpaidCount = enriched.filter(c => !c.isPaid).length;
        document.getElementById('statPaid').textContent = paidCount;
        document.getElementById('statUnpaid').textContent = unpaidCount;
        document.getElementById('statTotal').textContent = enriched.length;

        // Apply filter
        let filtered = enriched;
        if (State.filter === 'unpaid') {
            filtered = enriched.filter(c => !c.isPaid);
        }

        // Sort: unpaid first, then by name
        filtered.sort((a, b) => {
            if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
            return a.name.localeCompare(b.name);
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="text-center py-10">
                    <div class="text-5xl mb-3">${State.filter === 'unpaid' ? '🎉' : '📭'}</div>
                    <p class="text-gray-500 font-medium">
                        ${State.filter === 'unpaid' ? 'Semua warga sudah lunas!' : 'Tidak ada data.'}
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map((c, idx) => `
            <div class="card-enter bg-white rounded-xl shadow-sm border-l-4 ${c.isPaid ? 'border-l-green-500' : 'border-l-red-500'} overflow-hidden"
                 style="animation-delay: ${idx * 50}ms">
                <div class="flex items-center p-3 gap-3">
                    <!-- Status Icon -->
                    <div class="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-lg
                        ${c.isPaid ? 'bg-green-100' : 'bg-red-100'}">
                        ${c.isPaid ? '✅' : '⏳'}
                    </div>

                    <!-- Info -->
                    <div class="flex-1 min-w-0">
                        <p class="font-semibold text-gray-800 truncate">${this.escapeHtml(c.name)}</p>
                        <p class="text-xs text-gray-400 mt-0.5">
                            Jatuh tempo: Tgl ${c.due_date}
                            ${c.isPaid ? ` · Bayar: ${this.formatRupiah(c.payment.amount)}` : ''}
                        </p>
                    </div>

                    <!-- Actions -->
                    <div class="flex-shrink-0 flex items-center gap-1.5">
                        ${c.isPaid ? `
                            <button onclick="App.showDetail('${c.id}')"
                                class="p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                                title="Lihat Detail">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                </svg>
                            </button>
                        ` : `
                            ${c.phone ? `
                                <a href="${this.getWhatsAppLink(c)}"
                                   target="_blank"
                                   class="p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                                   title="Kirim WA Reminder">
                                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                    </svg>
                                </a>
                            ` : ''}
                            <button onclick="App.openPaymentModal('${c.id}')"
                                class="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                title="Catat Bayar">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                                </svg>
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `).join('');
    },

    // ============ PAYMENT MODAL ============
    openPaymentModal(customerId) {
        const customer = State.customers.find(c => c.id === customerId);
        if (!customer) return;

        document.getElementById('payCustomerId').value = customerId;
        document.getElementById('modalCustomerName').textContent =
            `${customer.name} — ${MONTH_NAMES[State.selectedMonth.getMonth()]} ${State.selectedMonth.getFullYear()}`;
        document.getElementById('payAmount').value = '';
        document.getElementById('payNotes').value = '';
        this.removePhoto();

        document.getElementById('paymentModal').classList.remove('hidden');
        document.getElementById('payAmount').focus();
    },

    closePaymentModal() {
        document.getElementById('paymentModal').classList.add('hidden');
        State.selectedPhotoFile = null;
    },

    // ============ PHOTO HANDLING ============
    previewPhoto(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            this.showToast('❌ Ukuran foto maks 5MB');
            event.target.value = '';
            return;
        }

        State.selectedPhotoFile = file;

        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('photoPreview').src = e.target.result;
            document.getElementById('photoPreviewContainer').classList.remove('hidden');
            document.getElementById('photoUploadBtn').classList.add('hidden');
        };
        reader.readAsDataURL(file);
    },

    removePhoto() {
        State.selectedPhotoFile = null;
        document.getElementById('payPhoto').value = '';
        document.getElementById('photoPreviewContainer').classList.add('hidden');
        document.getElementById('photoUploadBtn').classList.remove('hidden');
    },

    // ============ UPLOAD IMAGE TO SUPABASE STORAGE ============
    async uploadProofImage(customerId) {
        if (!State.selectedPhotoFile) return null;

        const file = State.selectedPhotoFile;
        const today = new Date().toISOString().split('T')[0]; // 2026-02-09
        const ext = file.name.split('.').pop() || 'jpg';
        const filePath = `proofs/${today}-${customerId}.${ext}`;

        const { data, error } = await supabase.storage
            .from('payment-proofs')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: true, // overwrite if same name exists
            });

        if (error) {
            console.error('Upload error:', error);
            throw new Error(`Gagal upload foto: ${error.message}`);
        }

        // Return the path only (NOT the full URL)
        return data.path;
    },

    // ============ SUBMIT PAYMENT ============
    async submitPayment(event) {
        event.preventDefault();

        const btn = document.getElementById('btnSubmitPayment');
        const customerId = document.getElementById('payCustomerId').value;
        const amount = parseInt(document.getElementById('payAmount').value, 10);
        const notes = document.getElementById('payNotes').value.trim();
        const monthYear = this.getMonthYear();

        if (!amount || amount <= 0) {
            this.showToast('❌ Masukkan jumlah yang valid');
            return false;
        }

        // Disable button & show loading
        btn.disabled = true;
        btn.textContent = '⏳ Menyimpan...';

        try {
            // 1. Upload photo (if any)
            let proofPath = null;
            if (State.selectedPhotoFile) {
                proofPath = await this.uploadProofImage(customerId);
            }

            // 2. Insert payment record
            const { error } = await supabase
                .from('payments')
                .insert({
                    customer_id: customerId,
                    amount: amount,
                    payment_date: new Date().toISOString().split('T')[0],
                    month_year: monthYear,
                    proof_path: proofPath,
                    notes: notes || null,
                });

            if (error) {
                // Handle duplicate payment
                if (error.code === '23505') {
                    throw new Error('Pembayaran bulan ini sudah dicatat!');
                }
                throw error;
            }

            // 3. Success
            this.showToast('✅ Pembayaran berhasil dicatat!');
            this.closePaymentModal();

            // 4. Reload data
            await this.loadPayments();
            this.renderCustomerList();

        } catch (err) {
            console.error('Payment submit error:', err);
            this.showToast(`❌ ${err.message || 'Gagal menyimpan'}`);
        } finally {
            btn.disabled = false;
            btn.textContent = '✅ Simpan Pembayaran';
        }

        return false;
    },

    // ============ DETAIL VIEW ============
    async showDetail(customerId) {
        const customer = State.customers.find(c => c.id === customerId);
        const payment = State.payments.find(p => p.customer_id === customerId);
        if (!customer || !payment) return;

        const container = document.getElementById('detailContent');

        // Check if proof image is expired (older than 40 days)
        const isExpired = this.isProofExpired(payment.payment_date);

        let proofHtml = '';
        if (payment.proof_path) {
            if (isExpired) {
                proofHtml = `
                    <div class="bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                        <div class="text-4xl mb-2">🕰️</div>
                        <p class="text-gray-500 font-medium text-sm">Gambar Sudah Kedaluwarsa</p>
                        <p class="text-gray-400 text-xs mt-1">Bukti bayar otomatis dihapus setelah ${PROOF_EXPIRY_DAYS} hari</p>
                    </div>
                `;
            } else {
                const { data: urlData } = supabase.storage
                    .from('payment-proofs')
                    .getPublicUrl(payment.proof_path);

                const daysLeft = this.daysUntilExpiry(payment.payment_date);

                proofHtml = `
                    <div class="relative">
                        <img
                            src="${urlData.publicUrl}"
                            alt="Bukti bayar"
                            class="w-full rounded-xl border"
                            onerror="this.outerHTML='<div class=\\'bg-gray-100 rounded-xl p-6 text-center\\'><p class=\\'text-gray-400 text-sm\\'>Gambar tidak ditemukan</p></div>'"
                        >
                        <div class="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                            ⏱ Hapus dalam ${daysLeft} hari
                        </div>
                    </div>
                `;
            }
        } else {
            proofHtml = `
                <div class="bg-gray-100 rounded-xl p-6 text-center">
                    <p class="text-gray-400 text-sm">Tidak ada bukti foto</p>
                </div>
            `;
        }

        container.innerHTML = `
            <h2 class="text-lg font-bold text-gray-800 mb-1">Detail Pembayaran</h2>
            <p class="text-sm text-gray-500 mb-4">${this.escapeHtml(customer.name)}</p>

            <div class="space-y-3 mb-4">
                <div class="flex justify-between text-sm">
                    <span class="text-gray-500">Jumlah</span>
                    <span class="font-bold text-green-600">${this.formatRupiah(payment.amount)}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-500">Tanggal Bayar</span>
                    <span class="font-medium">${this.formatDate(payment.payment_date)}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-500">Periode</span>
                    <span class="font-medium">${payment.month_year}</span>
                </div>
                ${payment.notes ? `
                <div class="flex justify-between text-sm">
                    <span class="text-gray-500">Catatan</span>
                    <span class="font-medium">${this.escapeHtml(payment.notes)}</span>
                </div>` : ''}
            </div>

            <div class="mb-4">
                <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Bukti Bayar</label>
                ${proofHtml}
            </div>

            <button onclick="App.closeDetailModal()"
                class="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors">
                Tutup
            </button>
        `;

        document.getElementById('detailModal').classList.remove('hidden');
    },

    closeDetailModal() {
        document.getElementById('detailModal').classList.add('hidden');
    },

    // ============ IMAGE EXPIRY LOGIC ============
    /**
     * Check if a payment proof is expired (older than PROOF_EXPIRY_DAYS).
     * @param {string} paymentDateStr - ISO date string (e.g. "2026-02-09")
     * @returns {boolean}
     */
    isProofExpired(paymentDateStr) {
        const paymentDate = new Date(paymentDateStr);
        const now = new Date();
        const diffMs = now - paymentDate;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return diffDays > PROOF_EXPIRY_DAYS;
    },

    /**
     * Calculate remaining days before proof expires.
     * @param {string} paymentDateStr
     * @returns {number}
     */
    daysUntilExpiry(paymentDateStr) {
        const paymentDate = new Date(paymentDateStr);
        const expiryDate = new Date(paymentDate);
        expiryDate.setDate(expiryDate.getDate() + PROOF_EXPIRY_DAYS);
        const now = new Date();
        const diffMs = expiryDate - now;
        return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    },

    // ============ WHATSAPP LINK ============
    getWhatsAppLink(customer) {
        const month = MONTH_NAMES[State.selectedMonth.getMonth()];
        const year = State.selectedMonth.getFullYear();
        const message = encodeURIComponent(
            `Assalamualaikum ${customer.name},\n\n` +
            `Mohon maaf mengingatkan, tagihan bulan *${month} ${year}* belum tercatat lunas.\n` +
            `Jatuh tempo: *Tanggal ${customer.due_date}*.\n\n` +
            `Mohon segera melakukan pembayaran. Terima kasih 🙏`
        );
        return `https://wa.me/${customer.phone}?text=${message}`;
    },

    // ============ REFRESH ============
    async refresh() {
        const btn = document.getElementById('btnRefresh');
        btn.classList.add('animate-spin');

        await this.loadCustomers();
        this.renderVillages();

        if (State.selectedVillage) {
            await this.loadPayments();
            this.renderCustomerList();
        }

        btn.classList.remove('animate-spin');
        this.showToast('🔄 Data diperbarui');
    },

    // ============ UI HELPERS ============
    showEmptyState() {
        document.getElementById('customerList').innerHTML = '';
        document.getElementById('emptyState').classList.remove('hidden');
    },

    showToast(message, duration = 2500) {
        const toast = document.getElementById('toast');
        document.getElementById('toastMessage').textContent = message;
        toast.classList.remove('hidden');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            toast.classList.add('hidden');
        }, duration);
    },

    formatRupiah(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(amount);
    },

    formatDate(dateStr) {
        return new Date(dateStr).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
};

// --------------------------------------------------
// 🏁 BOOT
// --------------------------------------------------
document.addEventListener('DOMContentLoaded', () => App.init());