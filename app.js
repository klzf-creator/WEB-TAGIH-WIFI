// ============================================
// TagihWarga PWA - Updated to match full DB schema
// ============================================

const SUPABASE_URL = "https://huundmnefqeqbjlahisw.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1dW5kbW5lZnFlcWJqbGFoaXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MDg0OTEsImV4cCI6MjA4NjE4NDQ5MX0.nvtdTmcsiZbD8IWR8PmY-rDwpPSSlda8L5FXJDLawfk";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

  // ============ INIT ============
  async init() {
    console.log("TagihWarga Initialized...");
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
      const { data: custData, error: custErr } = await db
        .from("customers")
        .select("*")
        .eq("due_date", date)
        .order("village")
        .order("name");

      if (custErr) throw custErr;
      this.state.customers = custData || [];

      const period = this.getPeriodStr();
      const { data: payData, error: payErr } = await db
        .from("payments")
        .select("*")
        .eq("month_year", period);

      if (payErr) throw payErr;
      this.state.payments = payData || [];

      this.renderCustomerList();
    } catch (err) {
      this.showToast("Gagal memuat: " + err.message);
    }
  },

  // ============ RENDER CUSTOMER LIST ============
  renderCustomerList() {
    const container = document.getElementById("customerList");
    const countLabel = document.getElementById("totalCount");
    const billLabel = document.getElementById("totalBill");
    if (!container) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const viewYear = this.state.selectedMonth.getFullYear();
    const viewMonth = this.state.selectedMonth.getMonth();

    let list = this.state.customers.map((c) => {
      const pay = this.state.payments.find((p) => p.customer_id === c.id);
      const bill = c.bill_amount || 100000;
      const paid = pay ? pay.amount : 0;
      const isLunas = paid >= bill;
      const isPartial = paid > 0 && paid < bill;

      let isLate = false;
      let lateDays = 0;
      if (!isLunas) {
        const dueDateObj = new Date(viewYear, viewMonth, c.due_date);
        const diffDays = Math.ceil(
          (today - dueDateObj) / (1000 * 60 * 60 * 24),
        );
        if (diffDays > 0) {
          isLate = true;
          lateDays = diffDays;
        }
      }

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

    // Search
    const isSearching = this.state.searchQuery.length > 0;
    if (isSearching) {
      const q = this.state.searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.customer_code && c.customer_code.toLowerCase().includes(q)) ||
          (c.address && c.address.toLowerCase().includes(q)),
      );
    } else if (this.state.filter === "unpaid") {
      list = list.filter((c) => !c.isLunas);
    }

    // Stats
    const totalOrang = list.length;
    const totalPotensi = list.reduce(
      (sum, c) => sum + (c.isLunas ? 0 : c.remaining),
      0,
    );
    if (countLabel) countLabel.textContent = `${totalOrang} Warga`;
    if (billLabel)
      billLabel.textContent = isSearching
        ? "Hasil Cari"
        : `Sisa: ${this.formatRupiah(totalPotensi)}`;

    if (list.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 opacity-50">
          <div class="text-4xl mb-3">${isSearching ? "🔍" : "🎉"}</div>
          <p>${isSearching ? "Tidak ditemukan." : "Semua Lunas!"}</p>
        </div>`;
      return;
    }

    // Group by village
    const grouped = {};
    list.forEach((c) => {
      if (!grouped[c.village]) grouped[c.village] = [];
      grouped[c.village].push(c);
    });

    let html = "";
    for (const [village, customers] of Object.entries(grouped)) {
      const villageUnpaid = customers.filter((c) => !c.isLunas).length;
      const villagePaid = customers.filter((c) => c.isLunas).length;

      html += `
        <div class="mt-4 mb-2 px-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black uppercase text-gray-400 tracking-wider">🏘️ ${this.escapeHtml(village)}</span>
            <span class="text-[10px] text-gray-400">${villagePaid}✅ ${villageUnpaid}⏳</span>
          </div>
        </div>`;

      customers.forEach((c) => {
        let border = "border-red-500";
        let statusBadge = `<span class="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">BELUM</span>`;
        let nominalInfo = `<span class="text-red-600">${this.formatRupiah(c.billAmount)}</span>`;
        let bgCard = "bg-white";

        if (c.isLunas) {
          border = "border-green-500";
          statusBadge = `<span class="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">LUNAS</span>`;
          nominalInfo = `<span class="text-green-600">Bayar: ${this.formatRupiah(c.paidAmount)}</span>`;
        } else if (c.isPartial) {
          border = "border-yellow-400";
          statusBadge = `<span class="text-[10px] font-bold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded">KURANG</span>`;
          nominalInfo = `<span class="text-yellow-700">Sisa: ${this.formatRupiah(c.remaining)}</span>`;
        }

        let lateBadge = "";
        if (c.isLate) {
          lateBadge = `<span class="inline-block bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded animate-pulse">⚠️ TELAT ${c.lateDays}H</span>`;
          border = "border-red-700 border-l-8";
          bgCard = "bg-red-50";
        }

        // Info package & code
        const metaLine = [
          c.customer_code ? c.customer_code : null,
          c.package ? c.package : null,
        ]
          .filter(Boolean)
          .join(" · ");

        // WA message
        const sisa = c.billAmount - c.paidAmount;
        let pesanWA = `Halo ${c.name}, tagihan WiFi ${c.package || ""} bulan ${MONTH_NAMES[viewMonth]} ${viewYear} `;
        if (c.isLunas) {
          pesanWA += `sudah LUNAS. Terima kasih.`;
        } else {
          pesanWA += `sebesar *${this.formatRupiah(sisa)}* belum lunas.`;
          if (c.isLate)
            pesanWA += ` ⚠️ *SUDAH TELAT ${c.lateDays} HARI.* Mohon segera dibayar.`;
          else pesanWA += ` Jatuh tempo tgl ${c.due_date}. Terima kasih 🙏`;
        }

        html += `
          <div class="${bgCard} p-3 rounded-xl shadow-sm border-l-4 ${border} mb-2 transition-all" onclick="App.showDetail('${c.id}')">
            <div class="flex justify-between items-start">
              <div class="flex-1 min-w-0 pr-2">
                <div class="flex items-center gap-1.5 flex-wrap mb-0.5">
                  ${statusBadge} ${lateBadge}
                </div>
                <h3 class="font-bold text-gray-800 text-[15px] truncate leading-tight">${this.escapeHtml(c.name)}</h3>
                ${metaLine ? `<p class="text-[10px] text-gray-400 mt-0.5">${this.escapeHtml(metaLine)}</p>` : ""}
                ${c.address ? `<p class="text-[10px] text-gray-400 truncate">${this.escapeHtml(c.address)}</p>` : ""}
                <p class="text-xs font-semibold mt-1">${nominalInfo}</p>
              </div>
              <div class="flex items-center gap-1.5 flex-shrink-0">
                ${
                  !c.isLunas
                    ? `
                  <a href="https://wa.me/${c.phone}?text=${encodeURIComponent(pesanWA)}" target="_blank" onclick="event.stopPropagation()"
                     class="w-9 h-9 flex items-center justify-center rounded-lg ${c.isLate ? "bg-red-600 text-white" : "bg-green-50 text-green-600"} text-sm">💬</a>
                  <button onclick="event.stopPropagation(); App.openPaymentModal('${c.id}')"
                     class="w-9 h-9 flex items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm font-bold">💰</button>
                `
                    : `
                  <button onclick="event.stopPropagation(); App.openPaymentModal('${c.id}')"
                     class="px-2 py-1.5 text-[10px] font-bold text-gray-400 bg-gray-50 rounded-lg">Edit</button>
                `
                }
              </div>
            </div>
          </div>`;
      });
    }

    container.innerHTML = html;
  },

  // ============ DETAIL MODAL ============
  async showDetail(id) {
    const c = this.state.customers.find((x) => x.id === id);
    if (!c) return;
    const pay = this.state.payments.find((p) => p.customer_id === id);

    let proofHtml =
      '<p class="text-gray-400 text-xs text-center py-4">Tidak ada bukti foto</p>';
    if (pay && pay.proof_path) {
      const payDate = new Date(pay.payment_date);
      const now = new Date();
      const diffDays = Math.floor((now - payDate) / (1000 * 60 * 60 * 24));

      if (diffDays > 40) {
        proofHtml = `
          <div class="bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl p-4 text-center">
            <div class="text-3xl mb-1">🕰️</div>
            <p class="text-gray-500 text-xs font-medium">Gambar Kedaluwarsa (>40 hari)</p>
          </div>`;
      } else {
        const { data: urlData } = db.storage
          .from("payment-proofs")
          .getPublicUrl(pay.proof_path);
        const daysLeft = 40 - diffDays;
        proofHtml = `
          <div class="relative">
            <img src="${urlData.publicUrl}" class="w-full rounded-xl border max-h-48 object-cover"
                 onerror="this.outerHTML='<p class=\\'text-gray-400 text-xs text-center py-4\\'>Gambar error</p>'">
            <span class="absolute top-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded-full">⏱ ${daysLeft}h lagi</span>
          </div>`;
      }
    }

    const bill = c.bill_amount || 100000;
    const paid = pay ? pay.amount : 0;
    const status =
      paid >= bill ? "✅ LUNAS" : paid > 0 ? "⚠️ KURANG" : "❌ BELUM";

    const content = document.getElementById("detailContent");
    content.innerHTML = `
      <h2 class="text-lg font-bold text-gray-800">${this.escapeHtml(c.name)}</h2>
      <p class="text-xs text-gray-400 mb-4">${c.customer_code || "-"} · ${c.package || "-"}</p>

      <div class="space-y-2 mb-4 text-sm">
        <div class="flex justify-between"><span class="text-gray-500">Status</span><span class="font-bold">${status}</span></div>
        <div class="flex justify-between"><span class="text-gray-500">Tagihan</span><span class="font-semibold">${this.formatRupiah(bill)}</span></div>
        <div class="flex justify-between"><span class="text-gray-500">Terbayar</span><span class="font-semibold text-green-600">${this.formatRupiah(paid)}</span></div>
        ${paid > 0 && paid < bill ? `<div class="flex justify-between"><span class="text-gray-500">Sisa</span><span class="font-semibold text-red-600">${this.formatRupiah(bill - paid)}</span></div>` : ""}
        <div class="flex justify-between"><span class="text-gray-500">Desa</span><span>${this.escapeHtml(c.village)}</span></div>
        ${c.address ? `<div class="flex justify-between"><span class="text-gray-500">Alamat</span><span class="text-right max-w-[60%] text-xs">${this.escapeHtml(c.address)}</span></div>` : ""}
        <div class="flex justify-between"><span class="text-gray-500">Jatuh Tempo</span><span>Tanggal ${c.due_date}</span></div>
        <div class="flex justify-between"><span class="text-gray-500">Paket</span><span>${c.package || "-"}</span></div>
        ${pay ? `<div class="flex justify-between"><span class="text-gray-500">Tgl Bayar</span><span>${this.formatDate(pay.payment_date)}</span></div>` : ""}
      </div>

      <div class="mb-4">
        <p class="text-[10px] font-bold text-gray-400 uppercase mb-2">Bukti Bayar</p>
        ${proofHtml}
      </div>

      <div class="flex gap-2">
        ${pay ? `<button onclick="App.deletePayment('${pay.id}','${c.id}')" class="flex-1 py-2.5 bg-red-50 text-red-600 font-bold rounded-xl text-sm">🗑️ Hapus Bayar</button>` : ""}
        <button onclick="App.closeDetailModal()" class="flex-1 py-2.5 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm">Tutup</button>
      </div>
    `;

    document.getElementById("detailModal").classList.remove("hidden");
  },

  closeDetailModal() {
    document.getElementById("detailModal").classList.add("hidden");
  },

  async deletePayment(payId, custId) {
    if (!confirm("Yakin hapus pembayaran ini?")) return;
    try {
      const { error } = await db.from("payments").delete().eq("id", payId);
      if (error) throw error;
      this.showToast("🗑️ Pembayaran dihapus");
      this.closeDetailModal();
      await this.loadCustomersByDate(this.state.selectedDate);
      this.calculateTodayIncome();
    } catch (err) {
      alert("Gagal hapus: " + err.message);
    }
  },

  // ============ PAYMENT MODAL ============
  openPaymentModal(id) {
    const c = this.state.customers.find((x) => x.id === id);
    const pay = this.state.payments.find((p) => p.customer_id === id);
    if (!c) return;

    this.removePhoto();
    document.getElementById("payCustomerId").value = id;
    document.getElementById("modalCustomerName").textContent =
      `${c.name} — ${c.customer_code || ""} — ${MONTH_NAMES[this.state.selectedMonth.getMonth()]} ${this.state.selectedMonth.getFullYear()}`;

    const inputAmt = document.getElementById("payAmount");
    let val = pay ? pay.amount : c.bill_amount || 100000;
    inputAmt.value = val.toLocaleString("id-ID");

    document.getElementById("paymentModal").classList.remove("hidden");
    setTimeout(() => inputAmt.select(), 100);
  },

  closePaymentModal() {
    document.getElementById("paymentModal").classList.add("hidden");
  },

  formatCurrencyInput(input) {
    let value = input.value.replace(/[^0-9]/g, "");
    if (value) {
      input.value = parseInt(value).toLocaleString("id-ID");
    } else {
      input.value = "";
    }
  },

  async submitPayment(e) {
    e.preventDefault();
    const btn = document.getElementById("btnSubmit");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "⏳ Menyimpan...";
    }

    const id = document.getElementById("payCustomerId").value;
    const rawAmount = document.getElementById("payAmount").value;
    const amt = parseInt(rawAmount.replace(/\./g, ""));

    try {
      if (!amt || amt <= 0) throw new Error("Nominal wajib diisi");

      let proofPath = null;
      if (this.state.photoFile) {
        const today = new Date().toISOString().split("T")[0];
        const fileName = `proofs/${today}-${id}.jpg`;
        const { data, error } = await db.storage
          .from("payment-proofs")
          .upload(fileName, this.state.photoFile, { upsert: true });
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

  // ============ DATE / FILTER / SEARCH ============
  selectDate(date) {
    this.state.selectedDate = date;
    this.renderDueDateTabs();
    document.getElementById("headerSubtitle").textContent =
      `JT Tgl ${date} · ${MONTH_NAMES[this.state.selectedMonth.getMonth()]} ${this.state.selectedMonth.getFullYear()}`;
    document.getElementById("searchInput").value = "";
    this.state.searchQuery = "";
    this.loadCustomersByDate(date);
  },

  handleSearch(query) {
    this.state.searchQuery = query;
    this.renderCustomerList();
  },

  setFilter(type) {
    this.state.filter = type;
    const btnU = document.getElementById("filterUnpaid");
    const btnA = document.getElementById("filterAll");
    if (type === "unpaid") {
      btnU.className =
        "flex-1 py-1.5 text-sm font-bold rounded-md bg-white text-red-600 shadow-sm transition-all";
      btnA.className =
        "flex-1 py-1.5 text-sm font-bold rounded-md text-gray-500 transition-all";
    } else {
      btnU.className =
        "flex-1 py-1.5 text-sm font-bold rounded-md text-gray-500 transition-all";
      btnA.className =
        "flex-1 py-1.5 text-sm font-bold rounded-md bg-white text-blue-600 shadow-sm transition-all";
    }
    this.renderCustomerList();
  },

  // ============ ADD CUSTOMER ============
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
    document.getElementById("addBill").value = "110.000";
    document.getElementById("addDueDate").value = "";
    document.getElementById("addCode").value = "";
    document.getElementById("addPackage").value = "10 Mbps";
    document.getElementById("addAddress").value = "";
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

    const name = document.getElementById("addName").value.trim();
    const village = document.getElementById("addVillage").value.trim();
    const phone = document.getElementById("addPhone").value.trim();
    const dueDate = parseInt(document.getElementById("addDueDate").value);
    const bill = parseInt(
      document.getElementById("addBill").value.replace(/\./g, ""),
    );
    const code = document.getElementById("addCode").value.trim() || null;
    const pack = document.getElementById("addPackage").value.trim() || null;
    const addr = document.getElementById("addAddress").value.trim() || null;

    try {
      if (!name || !village || !dueDate)
        throw new Error("Nama, Desa, dan Tgl JT wajib diisi");

      const payload = {
        name,
        village,
        phone: phone || null,
        due_date: dueDate,
        bill_amount: bill || 110000,
        customer_code: code,
        package: pack,
        address: addr,
      };

      const { error } = await db.from("customers").insert(payload);
      if (error) throw error;

      this.showToast("✅ Pelanggan ditambahkan!");
      this.closeAddModal();
      await this.loadInitialDates();
      if (this.state.selectedDate == dueDate) this.loadCustomersByDate(dueDate);
    } catch (err) {
      alert("Gagal: " + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Simpan";
      }
    }
  },

  // ============ PHOTO ============
  previewPhoto(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      this.showToast("❌ Foto maks 5MB");
      e.target.value = "";
      return;
    }
    this.state.photoFile = f;
    document.getElementById("photoPreview").src = URL.createObjectURL(f);
    document.getElementById("photoPreviewContainer").classList.remove("hidden");
    document.getElementById("photoUploadBtn").classList.add("hidden");
  },

  removePhoto() {
    this.state.photoFile = null;
    document.getElementById("payPhoto").value = "";
    document.getElementById("photoPreviewContainer").classList.add("hidden");
    document.getElementById("photoUploadBtn").classList.remove("hidden");
  },

  // ============ MONTH NAVIGATION ============
  changeMonth(d) {
    this.state.selectedMonth.setMonth(this.state.selectedMonth.getMonth() + d);
    this.updateMonthUI();
    if (this.state.selectedDate)
      this.loadCustomersByDate(this.state.selectedDate);
    this.calculateTodayIncome();
  },

  updateMonthUI() {
    const el = document.getElementById("monthDisplay");
    if (el)
      el.textContent = `${MONTH_NAMES[this.state.selectedMonth.getMonth()]} ${this.state.selectedMonth.getFullYear()}`;
  },

  getPeriodStr() {
    const d = this.state.selectedMonth;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  },

  // ============ TABS ============
  renderDueDateTabs() {
    const container = document.getElementById("dueDateButtons");
    if (!container) return;
    container.innerHTML = this.state.dueDates
      .map(
        (d) => `
        <button onclick="App.selectDate(${d})" class="${
          this.state.selectedDate === d
            ? "bg-blue-600 text-white border-blue-600 shadow-lg scale-105"
            : "bg-white text-gray-600 border-gray-200"
        } border px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all flex-shrink-0">Tgl ${d}</button>
      `,
      )
      .join("");
  },

  // ============ TODAY INCOME ============
  async calculateTodayIncome() {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const { data } = await db
        .from("payments")
        .select("amount")
        .eq("payment_date", todayStr);
      const total = (data || []).reduce((sum, p) => sum + p.amount, 0);
      const el = document.getElementById("todayTotal");
      if (el) el.textContent = this.formatRupiah(total);
    } catch (err) {
      console.warn("Income calc error:", err);
    }
  },

  // ============ UTILS ============
  refresh() {
    location.reload();
  },

  showEmptyState() {
    const el = document.getElementById("customerList");
    if (el) el.innerHTML = "";
    const empty = document.getElementById("emptyState");
    if (empty) empty.classList.remove("hidden");
  },

  showToast(m) {
    const t = document.getElementById("toast");
    if (t) {
      t.textContent = m;
      t.classList.remove("hidden");
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => t.classList.add("hidden"), 2500);
    }
  },

  formatRupiah(n) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(n);
  },

  formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  },

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};

document.addEventListener("DOMContentLoaded", () => App.init());
