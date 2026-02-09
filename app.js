// ============================================
// TagihWarga PWA - Final Analyst Version
// ============================================

const SUPABASE_URL = "https://huundmnefqeqbjlahisw.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1dW5kbW5lZnFlcWJqbGFoaXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MDg0OTEsImV4cCI6MjA4NjE4NDQ5MX0.nvtdTmcsiZbD8IWR8PmY-rDwpPSSlda8L5FXJDLawfk";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.App = {
  state: {
    customers: [],
    payments: [],
    dueDates: [],
    selectedDate: null,
    selectedMonth: new Date(),
    filter: "unpaid",
    searchQuery: "",
    photoFile: null,
  },

  async init() {
    console.log("System Initialized...");
    this.populateDateSelect();
    this.updateMonthUI();
    await this.loadInitialDates();
  },

  // ============ DATA LOADING ============

  async loadInitialDates() {
    try {
      const { data, error } = await db.from("customers").select("due_date");
      if (error) throw error;

      const dates = [...new Set(data.map((c) => c.due_date))].sort(
        (a, b) => a - b,
      );
      this.state.dueDates = dates;

      this.renderDueDateTabs();
      this.calculateTodayIncome();

      // Auto select logic
      if (dates.length > 0 && !this.state.selectedDate) {
        this.selectDate(dates[0]);
      } else if (this.state.selectedDate) {
        this.loadCustomersByDate(this.state.selectedDate);
      } else {
        this.showEmptyState();
      }
    } catch (err) {
      console.error(err);
      this.showToast("❌ Gagal koneksi database");
    }
  },

  async loadCustomersByDate(date) {
    const list = document.getElementById("customerList");
    if (list)
      list.innerHTML =
        '<div class="space-y-3 pt-4"><div class="skeleton h-24 rounded-xl"></div><div class="skeleton h-24 rounded-xl"></div></div>';

    try {
      // Ambil Customer
      const { data: custData, error: custErr } = await db
        .from("customers")
        .select("*")
        .eq("due_date", date)
        .order("village", { ascending: true })
        .order("name", { ascending: true });

      if (custErr) throw custErr;
      this.state.customers = custData || [];

      // Ambil Payment Bulan Ini
      const period = this.getPeriodStr();
      const { data: payData, error: payErr } = await db
        .from("payments")
        .select("*")
        .eq("month_year", period);

      if (payErr) throw payErr;
      this.state.payments = payData || [];

      this.renderCustomerList();
    } catch (err) {
      this.showToast("Gagal memuat detail: " + err.message);
    }
  },

  // ============ RENDER LOGIC (CORE) ============

  renderCustomerList() {
    const container = document.getElementById("customerList");
    const countLabel = document.getElementById("totalCount");
    const billLabel = document.getElementById("totalBill");
    if (!container) return;

    // Ambil Tanggal Hari Ini (1-31)
    const todayDate = new Date().getDate();

    // 1. GABUNGKAN DATA
    let list = this.state.customers.map((c) => {
      const pay = this.state.payments.find((p) => p.customer_id === c.id);
      const bill = c.bill_amount || 100000;
      const paid = pay ? pay.amount : 0;

      const isLunas = paid >= bill;
      const isPartial = paid > 0 && paid < bill;

      // LOGIKA TELAT BAYAR (OVERDUE)
      // Hanya berlaku jika: Belum Lunas DAN Hari ini > Tanggal Jatuh Tempo
      const isLate = !isLunas && todayDate > c.due_date;
      const lateDays = isLate ? todayDate - c.due_date : 0;

      return {
        ...c,
        billAmount: bill,
        paidAmount: paid,
        isLunas,
        isPartial,
        isLate,
        lateDays,
        remaining: bill - paid,
        paymentData: pay,
      };
    });

    // 2. SEARCH LOGIC
    const isSearching = this.state.searchQuery.length > 0;
    if (isSearching) {
      const query = this.state.searchQuery.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(query));
    } else {
      // 3. FILTER LOGIC
      if (this.state.filter === "unpaid") {
        list = list.filter((c) => !c.isLunas);
      }
    }

    // Statistik
    const totalOrang = list.length;
    const totalPotensi = list.reduce(
      (sum, c) => sum + (c.isLunas ? 0 : c.remaining),
      0,
    );

    if (countLabel) countLabel.textContent = `${totalOrang} Warga`;
    if (billLabel)
      billLabel.textContent = isSearching
        ? "Hasil Cari"
        : `Sisa Tagihan: ${this.formatRupiah(totalPotensi)}`;

    // Render Empty
    if (list.length === 0) {
      container.innerHTML = `
                <div class="text-center py-12 opacity-50">
                    <div class="text-4xl mb-3">${isSearching ? "🔍" : "🎉"}</div>
                    <p>${isSearching ? "Tidak ditemukan." : "Semua aman / Lunas!"}</p>
                </div>`;
      return;
    }

    // Render Cards
    container.innerHTML = list
      .map((c) => {
        let border = "border-red-500";
        let statusBadge = `<span class="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded">BELUM</span>`;
        let nominalInfo = `<span class="text-red-600">Tagihan: ${this.formatRupiah(c.billAmount)}</span>`;
        let bgCard = "bg-white";

        if (c.isLunas) {
          border = "border-green-500";
          statusBadge = `<span class="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded">LUNAS</span>`;
          nominalInfo = `<span class="text-green-600">Bayar: ${this.formatRupiah(c.paidAmount)}</span>`;
        } else if (c.isPartial) {
          border = "border-yellow-400";
          statusBadge = `<span class="text-[10px] font-bold text-yellow-700 bg-yellow-50 px-2 py-1 rounded">KURANG</span>`;
          nominalInfo = `<span class="text-yellow-700">Kurang: ${this.formatRupiah(c.remaining)}</span>`;
        }

        // TAMPILAN KHUSUS JIKA TELAT
        let lateBadge = "";
        if (c.isLate) {
          // Tambah badge merah gelap "TELAT X HARI"
          lateBadge = `<div class="mt-1 inline-block bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md animate-pulse">⚠️ TELAT ${c.lateDays} HARI</div>`;
          // Ubah border jadi lebih tebal/gelap
          border = "border-red-700 border-l-8";
          bgCard = "bg-red-50"; // Latar agak merah sedikit biar kolektor sadar
        }

        // WA Link Logic
        const sisa = c.billAmount - c.paidAmount;
        let pesanWA = `Halo ${c.name}, tagihan WiFi bulan ini `;

        if (c.isLunas) {
          pesanWA += `sudah LUNAS. Terima kasih.`;
        } else {
          pesanWA += `masih ada tagihan Rp ${this.formatRupiah(sisa)}. `;
          if (c.isLate) {
            pesanWA += `*MOHON MAAF, SUDAH TELAT ${c.lateDays} HARI DARI TANGGAL JATUH TEMPO.* Mohon segera dibayar hari ini.`;
          } else {
            pesanWA += `Mohon dicek kembali. Terima kasih.`;
          }
        }
        const waText = encodeURIComponent(pesanWA);

        return `
            <div class="${bgCard} p-4 rounded-xl shadow-sm border-l-4 ${border} mb-3 flex justify-between items-center relative overflow-hidden transition-all">
                <div class="flex-1 min-w-0 pr-2">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-[10px] font-bold uppercase text-gray-500 bg-gray-200 px-1.5 rounded">${c.village}</span>
                        ${statusBadge}
                    </div>
                    <h3 class="font-bold text-gray-800 text-lg truncate mb-0 leading-tight">${c.name}</h3>
                    ${lateBadge} <p class="text-xs font-medium mt-1">${nominalInfo}</p>
                </div>
                <div class="flex items-center gap-2">
                    ${
                      !c.isLunas
                        ? `
                        <a href="https://wa.me/${c.phone}?text=${waText}" target="_blank" class="w-10 h-10 flex items-center justify-center rounded-lg ${c.isLate ? "bg-red-600 text-white hover:bg-red-700 shadow-md" : "bg-green-50 text-green-600"} transition-all">
                           💬
                        </a>
                        <button onclick="App.openPaymentModal('${c.id}')" class="w-10 h-10 flex items-center justify-center rounded-lg bg-blue-50 text-blue-600 font-bold text-lg shadow-sm">💰</button>
                    `
                        : `
                        <button onclick="App.openPaymentModal('${c.id}')" class="px-3 py-2 text-xs font-bold text-gray-400 bg-gray-50 rounded-lg hover:bg-gray-100">Edit</button>
                    `
                    }
                </div>
            </div>`;
      })
      .join("");
  },

  // ============ FORMAT CURRENCY INPUT (NEW) ============
  formatCurrencyInput(input) {
    // Hapus semua karakter selain angka
    let value = input.value.replace(/[^0-9]/g, "");

    // Ubah jadi format ribuan (100.000)
    if (value) {
      value = parseInt(value).toLocaleString("id-ID");
      input.value = value; // Update tampilan input
    } else {
      input.value = "";
    }
  },

  // ============ INTERACTION & PAYMENT ============

  selectDate(date) {
    this.state.selectedDate = date;
    this.renderDueDateTabs();
    document.getElementById("headerSubtitle").textContent =
      `Jatuh Tempo Tgl ${date} ${MONTH_NAMES[this.state.selectedMonth.getMonth()]}`;

    // Reset Search saat ganti tanggal
    document.getElementById("searchInput").value = "";
    this.state.searchQuery = "";

    this.loadCustomersByDate(date);
  },

  handleSearch(query) {
    this.state.searchQuery = query;
    this.renderCustomerList(); // Search diutamakan di sini
  },

  setFilter(type) {
    this.state.filter = type;
    const btnUnpaid = document.getElementById("filterUnpaid");
    const btnAll = document.getElementById("filterAll");

    if (type === "unpaid") {
      btnUnpaid.className =
        "flex-1 py-1.5 text-sm font-bold rounded-md bg-white text-red-600 shadow-sm transition-all";
      btnAll.className =
        "flex-1 py-1.5 text-sm font-bold rounded-md text-gray-500 transition-all";
    } else {
      btnUnpaid.className =
        "flex-1 py-1.5 text-sm font-bold rounded-md text-gray-500 transition-all";
      btnAll.className =
        "flex-1 py-1.5 text-sm font-bold rounded-md bg-white text-blue-600 shadow-sm transition-all";
    }
    this.renderCustomerList();
  },

  openPaymentModal(id) {
    const c = this.state.customers.find((x) => x.id === id);
    const pay = this.state.payments.find((p) => p.customer_id === id);
    if (!c) return;

    this.removePhoto();
    document.getElementById("payCustomerId").value = id;
    document.getElementById("modalCustomerName").textContent = c.name;

    const inputAmt = document.getElementById("payAmount");
    let val = pay ? pay.amount : c.bill_amount || 100000;

    // Format nilai awal ke format Rupiah (pakai titik)
    inputAmt.value = val.toLocaleString("id-ID");

    document.getElementById("paymentModal").classList.remove("hidden");
    setTimeout(() => inputAmt.select(), 100);
  },

  closePaymentModal() {
    document.getElementById("paymentModal").classList.add("hidden");
  },

  async submitPayment(e) {
    e.preventDefault();
    const btn = document.getElementById("btnSubmit"); // ID SUDAH DIPERBAIKI DI HTML
    if (btn) {
      btn.disabled = true;
      btn.textContent = "⏳ Menyimpan...";
    }

    const id = document.getElementById("payCustomerId").value;
    const rawAmount = document.getElementById("payAmount").value;

    // PENTING: Hapus titik sebelum simpan ke database (100.000 -> 100000)
    const amt = parseInt(rawAmount.replace(/\./g, ""));

    try {
      if (!amt || amt <= 0) throw new Error("Nominal wajib diisi");

      let proofPath = null;
      if (this.state.photoFile) {
        const fileName = `proofs/${Date.now()}_${id}.jpg`;
        const { data, error } = await db.storage
          .from("payment-proofs")
          .upload(fileName, this.state.photoFile);
        if (!error) proofPath = data.path;
      }

      const payload = {
        customer_id: id,
        amount: amt,
        month_year: this.getPeriodStr(),
        payment_date: new Date().toISOString().split("T")[0],
      };
      if (proofPath) payload.proof_path = proofPath;

      const { error } = await db
        .from("payments")
        .upsert(payload, { onConflict: "customer_id, month_year" });
      if (error) throw error;

      this.showToast("✅ Tersimpan!");
      this.closePaymentModal();
      await this.loadCustomersByDate(this.state.selectedDate);
      this.calculateTodayIncome();
    } catch (err) {
      alert("Gagal: " + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "✅ Simpan Pembayaran";
      }
    }
  },

  // ... (Sisa fungsi helper, tambah user, foto, dll sama persis, disederhanakan agar fit) ...

  // UTILS LENGKAP
  async calculateTodayIncome() {
    const todayStr = new Date().toISOString().split("T")[0];
    const { data } = await db
      .from("payments")
      .select("amount")
      .eq("payment_date", todayStr);
    const total = (data || []).reduce((sum, p) => sum + p.amount, 0);
    const el = document.getElementById("todayTotal");
    if (el) el.textContent = this.formatRupiah(total);
  },

  renderDueDateTabs() {
    const container = document.getElementById("dueDateButtons");
    if (!container) return;
    container.innerHTML = this.state.dueDates
      .map(
        (d) => `
            <button onclick="App.selectDate(${d})" class="${this.state.selectedDate === d ? "bg-blue-600 text-white border-blue-600 shadow-lg scale-105" : "bg-white text-gray-600 border-gray-200"} border px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all flex-shrink-0">Tgl ${d}</button>
        `,
      )
      .join("");
  },

  // TAMBAH PELANGGAN
  populateDateSelect() {
    const select = document.getElementById("addDueDate");
    if (!select) return;
    let html = '<option value="" disabled selected>Pilih Tgl</option>';
    for (let i = 1; i <= 31; i++) html += `<option value="${i}">${i}</option>`;
    select.innerHTML = html;
  },
  openAddModal() {
    document.getElementById("addName").value = "";
    document.getElementById("addVillage").value = "";
    document.getElementById("addPhone").value = "";
    document.getElementById("addBill").value = "100.000";
    document.getElementById("addDueDate").value = "";
    document.getElementById("addModal").classList.remove("hidden");
  },
  closeAddModal() {
    document.getElementById("addModal").classList.add("hidden");
  },
  async submitNewCustomer(e) {
    e.preventDefault();
    const btn = document.getElementById("btnAddSubmit");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "⏳ ...";
    }

    const name = document.getElementById("addName").value;
    const village = document.getElementById("addVillage").value;
    const phone = document.getElementById("addPhone").value;
    const dueDate = document.getElementById("addDueDate").value;
    // Clean format rupiah dari input tambah user juga
    const bill = parseInt(
      document.getElementById("addBill").value.replace(/\./g, ""),
    );

    try {
      const { error } = await db
        .from("customers")
        .insert({ name, village, phone, due_date: dueDate, bill_amount: bill });
      if (error) throw error;
      this.showToast("✅ Berhasil!");
      this.closeAddModal();
      await this.loadInitialDates();
      if (this.state.selectedDate == dueDate) this.loadCustomersByDate(dueDate);
    } catch (err) {
      alert(err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Simpan";
      }
    }
  },

  previewPhoto(e) {
    const f = e.target.files[0];
    if (f) {
      this.state.photoFile = f;
      document.getElementById("photoPreview").src = URL.createObjectURL(f);
      document
        .getElementById("photoPreviewContainer")
        .classList.remove("hidden");
      document.getElementById("photoUploadBtn").classList.add("hidden");
    }
  },
  removePhoto() {
    this.state.photoFile = null;
    document.getElementById("payPhoto").value = "";
    document.getElementById("photoPreviewContainer").classList.add("hidden");
    document.getElementById("photoUploadBtn").classList.remove("hidden");
  },
  changeMonth(d) {
    this.state.selectedMonth.setMonth(this.state.selectedMonth.getMonth() + d);
    this.updateMonthUI();
    if (this.state.selectedDate)
      this.loadCustomersByDate(this.state.selectedDate);
  },
  updateMonthUI() {
    document.getElementById("monthDisplay").textContent =
      `${MONTH_NAMES[this.state.selectedMonth.getMonth()]} ${this.state.selectedMonth.getFullYear()}`;
  },
  getPeriodStr() {
    const d = this.state.selectedMonth;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  },
  refresh() {
    location.reload();
  },
  showEmptyState() {
    document.getElementById("customerList").innerHTML = "";
    document.getElementById("emptyState").classList.remove("hidden");
  },
  showToast(m) {
    const t = document.getElementById("toast");
    if (t) {
      t.textContent = m;
      t.classList.remove("hidden");
      setTimeout(() => t.classList.add("hidden"), 2500);
    }
  },
  formatRupiah(n) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(n);
  },
};

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
document.addEventListener("DOMContentLoaded", () => App.init());
