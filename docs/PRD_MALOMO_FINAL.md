# PRD ICT Malomo Screener — Poin 1–7

Status: FINAL untuk keputusan fungsional Poin 1–7.
Tanggal penguncian: 6 Oktober 2026 (Asia/Makassar).
Revisi terkunci: EMA 21/30/50, konfirmasi struktur patah melalui break–retest, dan volume sebagai penguat.
Acuan: NAHKODA V1 — Struktur Revisi Integrasi ICT & Quant, serta keputusan pembahasan proyek ICT Malomo Screener.

## 1. Tujuan dan cakupan

Memilih kandidat pasar Binance Futures berdasarkan likuiditas, memvalidasi arah melalui struktur harga 1D dan 4H, menghasilkan maksimal 150 kandidat, menilai status struktur serta evidence dan konteks volatilitas, lalu membentuk Trading Plan dengan validasi entry 1H dan minimum RR 1:2.2.

Dokumen ini mengunci Poin 1–7 sesuai keputusan pembahasan proyek.

## 2. Poin 1 — Scanner Market Real-Time

### Tujuan

Membentuk daftar kandidat awal berdasarkan ranking volume perdagangan antar-pair.

### Cakupan pasar dan input

- Pasar: Binance USDⓈ-M Futures.
- Kontrak: perpetual dengan quote USDT saja.
- Sumber data pasar real-time: Binance WebSocket.
- Metrik ranking: 24h Quote Volume.

### Aturan final

1. Ranking pair dalam cakupan pasar berdasarkan 24h Quote Volume, dari terbesar ke terkecil.
2. Pertahankan maksimal Top 250 sebagai kandidat awal.
3. Daftar bersifat dinamis mengikuti perubahan ranking.
4. Cross-Sectional Ranking hanya memilih kandidat antar-pair.
5. Ranking tidak menentukan arah bullish/bearish dan bukan sinyal trading.

### Output

Daftar kandidat Top 250 dinamis yang memuat pair, nilai 24h Quote Volume, dan posisi ranking untuk diproses pada Poin 2.

### Kriteria penerimaan

- Kandidat hanya berasal dari kontrak perpetual USDT pada Binance USDⓈ-M Futures.
- Daftar diurutkan berdasarkan 24h Quote Volume dan tidak melebihi 250 pair.
- Perubahan ranking dapat mengubah anggota daftar kandidat.
- Tidak ada keputusan arah atau sinyal trading yang berasal dari ranking Poin 1.

## 3. Poin 2 — Deteksi Arah / Trend Market

### Tujuan

Memvalidasi arah berdasarkan keselarasan struktur 1D dan 4H, memilih kandidat melalui ranking volume 60 menit berjalan, serta memberikan informasi kualitas trend.

### Input

- Kandidat Top 250 dari Poin 1.
- Struktur harga pada timeframe 1D dan 4H.
- EMA 21, EMA 30, dan EMA 50 pada masing-masing timeframe, sebagai informasi posisi harga.
- Volume sebagai evidence penguat break, bukan syarat wajib.
- Rolling 60-minute Quote Volume.
- Pengukuran Trend Efficiency sebagai informasi kualitas.

### Aturan arah final

| Struktur 1D | Struktur 4H | Keputusan arah |
|---|---|---|
| HH–HL | HH–HL | Bullish valid |
| LH–LL | LH–LL | Bearish valid |
| Bullish | Bearish | Tidak diberi arah valid |
| Bearish | Bullish | Tidak diberi arah valid |
| Tidak jelas pada salah satu atau kedua timeframe | Tidak selaras atau belum jelas | Tidak diberi arah valid |

Arah ditentukan oleh struktur harga. Definisi swing dan validasi fractal mengikuti Poin 3 yang sudah dikunci dalam dokumen ini.

### EMA 21/30/50 — keputusan final

- EMA dibaca terpisah pada 1D dan 4H. Keselarasan struktur kedua timeframe tetap wajib untuk arah valid.
- EMA hanya memberikan informasi posisi harga; tidak menentukan arah dan tidak menjadi hard gate.
- Bullish: struktur HH–HL masih valid dan belum patah terkonfirmasi. Harga dapat berada di atas ketiga EMA, di antara EMA 21 dan EMA 30 tetapi di atas EMA 50, di bawah EMA 21 dan EMA 30 tetapi di atas EMA 50, atau di bawah ketiga EMA tanpa otomatis mengubah arah menjadi bearish.
- Bearish merupakan mirror bullish: struktur LH–LL masih valid dan belum patah terkonfirmasi. Harga dapat berada di bawah ketiga EMA, di antara EMA 21 dan EMA 30 tetapi di bawah EMA 50, di atas EMA 21 dan EMA 30 tetapi di bawah EMA 50, atau di atas ketiga EMA tanpa otomatis mengubah arah menjadi bullish.
- Crossing harga terhadap EMA maupun crossing antar-EMA tidak otomatis mengonfirmasi perubahan arah.
- Posisi harga terhadap EMA tidak menggugurkan kandidat dengan struktur arah valid.

### Struktur patah — keputusan final

Aturan dibaca pada timeframe struktur yang bersangkutan, terpisah untuk 1D dan 4H.

| Tahap | Struktur bullish | Struktur bearish |
|---|---|---|
| Kandidat break | Candle close di bawah protected Swing Low / HL | Candle close di atas protected Swing High / LH |
| Menunggu konfirmasi | Break sudah terjadi; retest belum terkonfirmasi | Break sudah terjadi; retest belum terkonfirmasi |
| Struktur patah terkonfirmasi | Retest dari bawah gagal merebut kembali level melalui candle close di atas protected HL | Retest dari atas gagal merebut kembali level melalui candle close di bawah protected LH |

- Wick yang melewati protected swing tanpa candle close di luar level tidak cukup sebagai kandidat break.
- Close melewati protected swing saja belum cukup untuk status struktur patah terkonfirmasi; konfirmasi membutuhkan retest yang gagal merebut kembali level.
- Sebelum retest terkonfirmasi, status wajib dicatat sebagai **menunggu konfirmasi**, bukan otomatis arah berlawanan.
- Struktur patah terkonfirmasi membatalkan struktur lama. Arah berlawanan tetap membutuhkan struktur yang valid dan keselarasan 1D–4H.
- Volume hanya menjadi evidence penguat kualitas break. Volume lemah tidak otomatis membatalkan break atau konfirmasi break–retest yang memenuhi aturan struktur.
- Tidak ditambahkan threshold volume wajib atau hard gate RVOL ≥ 1.10.
- Status **menunggu konfirmasi tidak menggugurkan kandidat dari Top 150**. Kandidat tetap mengikuti ranking Quote Volume 60 menit berjalan, dengan status tersebut ditampilkan.

### Aturan ranking final

1. Validasi arah dilakukan terlebih dahulu.
2. Hanya kandidat dengan arah valid yang masuk ranking lanjutan.
3. Ranking berdasarkan Rolling 60-minute Quote Volume, dari terbesar ke terkecil.
4. Ambil maksimal Top 150 dari kandidat dengan arah valid.
5. Top 150 merupakan batas total kandidat Poin 2, bukan kuota terpisah untuk setiap arah.
6. Cross-Sectional Ranking hanya memilih kandidat; tidak menentukan arah atau sinyal trading.
7. Status menunggu konfirmasi tidak menjadi alasan pengguguran; kandidat tetap mengikuti ranking Quote Volume 60 menit berjalan.

### Trend Efficiency — keputusan final

**Trend Efficiency hanya informasi kualitas, tidak menentukan arah atau menggugurkan kandidat.**

### Output

Daftar maksimal 150 kandidat yang memuat:

- Pair.
- Struktur arah 1D dan 4H.
- Status struktur per timeframe: belum patah, menunggu konfirmasi, atau patah terkonfirmasi.
- Informasi posisi harga terhadap EMA 21/30/50 per timeframe.
- Evidence volume sebagai penguat break, jika terjadi break.
- Arah valid: bullish atau bearish.
- Rolling 60-minute Quote Volume dan posisi ranking.
- Informasi kualitas Trend Efficiency.

### Kriteria penerimaan

- Bullish valid hanya diberikan jika struktur 1D dan 4H sama-sama HH–HL.
- Bearish valid hanya diberikan jika struktur 1D dan 4H sama-sama LH–LL.
- Kandidat dengan konflik arah atau struktur tidak jelas tidak masuk daftar arah valid.
- Ranking volume 60 menit dilakukan setelah validasi arah.
- Output tidak melebihi 150 kandidat; jumlah boleh lebih kecil jika kandidat arah valid tidak mencukupi.
- Kandidat tidak gugur hanya karena Trend Efficiency menunjukkan trend choppy.
- Trend Efficiency tidak mengubah arah atau urutan ranking volume.
- Posisi harga di sisi berlawanan dari ketiga EMA tidak otomatis membalik arah struktur.
- Crossing EMA tidak otomatis mengubah arah.
- Wick saja tidak memicu kandidat break protected swing.
- Close melewati protected swing tanpa retest terkonfirmasi menghasilkan status menunggu konfirmasi.
- Status menunggu konfirmasi tidak menggugurkan kandidat dari Top 150 dan tetap ditampilkan.
- Break diikuti retest yang gagal merebut kembali level melalui candle close menghasilkan status struktur patah terkonfirmasi.
- Volume lemah tidak menjadi veto terhadap konfirmasi struktur patah.
- Struktur patah tidak otomatis menghasilkan arah berlawanan tanpa struktur arah baru yang valid.

## 4. Poin 3 — Swing Structure

Status: FINAL.

### 1. Timeframe dan urutan pembacaan

Dibaca pada **1D dan 4H secara terpisah**:

Price Structure → Kandidat Swing → Konfirmasi Fractal → Klasifikasi Struktural/Internal → HH/HL/LH/LL.

### 2. Kewenangan fractal

- Menggunakan **5-bar confirmed fractal**.
- Kandidat baru terkonfirmasi setelah **dua candle di sisi kanan selesai close**.
- Fractal hanya mengonfirmasi titik swing; tidak menentukan arah atau kelas struktural/internal.
- Konfirmasi tidak boleh digunakan sebelum waktunya.

### 3. Swing struktural dan internal

| Jenis | Fungsi |
|---|---|
| **Swing struktural** | Membentuk struktur utama HH–HL / LH–LL, menjadi acuan penembusan dan protected swing |
| **Swing internal** | Membaca gerakan lokal di dalam leg utama; penembusannya tidak otomatis mematahkan struktur utama |

Kelas swing relatif terhadap timeframe. **Swing struktural 4H dapat menjadi swing internal dalam struktur 1D.**

### 4. Pemilihan struktur awal

- Baca riwayat candle dari lama ke baru.
- Swing yang sudah dikonfirmasi fractal menjadi **acuan sementara**.
- Arah awal baru valid setelah penembusan melalui candle close disertai urutan **HH–HL untuk bullish** atau **LH–LL untuk bearish**.
- Jika urutannya belum jelas, status **struktur belum jelas**.
- EMA tidak digunakan untuk memaksakan arah.

### 5. Pemilihan swing asal dan protected swing

**Bullish:**

- Candle close menembus swing high struktural acuan.
- Pilih **swing low terendah yang sudah dikonfirmasi fractal**, sejak titik swing high acuan hingga candle break.
- Swing low tersebut menjadi **protected low**.
- Puncak baru tetap menunggu konfirmasi fractal.

**Bearish — mirror bullish:**

- Candle close menembus swing low struktural acuan.
- Pilih **swing high tertinggi yang sudah dikonfirmasi fractal**, sejak titik swing low acuan hingga candle break.
- Swing high tersebut menjadi **protected high**.
- Lembah baru tetap menunggu konfirmasi fractal.

Protected swing tidak berpindah hanya karena muncul swing internal baru.

### 6. Hubungan dengan Poin 2

- Break pada 4H hanya memengaruhi status struktur 4H; begitu pula 1D.
- Struktur patah terkonfirmasi mengikuti aturan **close melewati protected swing → retest gagal merebut kembali level**.
- Sebelum retest terkonfirmasi: **menunggu konfirmasi**, belum otomatis arah berlawanan.
- Volume hanya penguat.
- Konflik arah 1D–4H menghasilkan **arah gabungan tidak valid**.

## 5. Poin 4 — Status Struktur Market

Status: FINAL.

### Timeframe dan acuan

Dibaca pada **1D dan 4H secara terpisah**, menggunakan swing struktural yang ditentukan pada Poin 3.

### Klasifikasi status struktur

| Status | Bullish | Bearish |
|---|---|---|
| **Breakout / Breakdown** | Candle close di atas swing high struktural | Candle close di bawah swing low struktural |
| **Pullback** | Retrace turun, belum ada close di bawah protected low | Retrace naik, belum ada close di atas protected high |
| **Trend lanjutan** | Setelah pullback valid, close menembus puncak pullback | Setelah pullback valid, close menembus lembah pullback |
| **Menunggu konfirmasi patah** | Close di bawah protected low; retest belum terkonfirmasi | Close di atas protected high; retest belum terkonfirmasi |
| **Struktur patah terkonfirmasi** | Retest dari bawah gagal merebut kembali protected low melalui candle close | Retest dari atas gagal merebut kembali protected high melalui candle close |
| **Reversal terkonfirmasi** | Struktur bearish sudah patah terkonfirmasi, lalu terbentuk HL–HH | Struktur bullish sudah patah terkonfirmasi, lalu terbentuk LH–LL |

### Kelanjutan lokal versus kelanjutan struktural

- Penembusan swing internal setelah pullback adalah **kelanjutan lokal**.
- Penembusan swing internal tidak otomatis membentuk HH/LL struktural atau mematahkan struktur utama.
- Penembusan swing high struktural acuan melalui candle close diperlukan untuk pembentukan HH struktural baru.
- Penembusan swing low struktural acuan melalui candle close diperlukan untuk pembentukan LL struktural baru.
- Titik puncak/lembah baru tetap menunggu konfirmasi fractal sesuai Poin 3.
- Dengan demikian, status trend lanjutan dibedakan berdasarkan kelas swing yang ditembus: internal untuk kelanjutan lokal, struktural untuk kelanjutan struktur utama.

### Liquidity Sweep

- Wick melewati swing high, tetapi close kembali di bawahnya → **sweep high**, bukan breakout.
- Wick melewati swing low, tetapi close kembali di atasnya → **sweep low**, bukan breakdown.
- Sweep tidak otomatis mengubah arah atau protected swing.

### Batas kewenangan evidence

- Volume hanya menjadi penguat.
- ATR dan RVOL bukan syarat wajib validitas event, baik individual maupun gabungan.
- Validitas event mengikuti struktur harga, candle close, dan aturan konfirmasi break–retest yang sudah dikunci.
- Struktur patah terkonfirmasi tidak otomatis berarti reversal terkonfirmasi; arah baru harus memenuhi urutan struktur pada tabel di atas.

## 6. Poin 5 — Momentum / Evidence Kualitas Structural Event

Status: FINAL.

### Urutan dan timeframe pembacaan

- Evidence dibaca **setelah event valid secara struktur**, pada **1D dan 4H secara terpisah**.
- Event yang dinilai mencakup Breakout, Breakdown, Trend Lanjutan, dan Reversal Terkonfirmasi sesuai Poin 4.
- Urutan: **Structural Event Valid → Momentum Magnitude → Participation → Kualitas Evidence**.
- Gunakan **candle yang sudah close** untuk penilaian final.

### Komponen dan batas kewenangan

| Komponen | Fungsi | Batas kewenangan |
|---|---|---|
| **Candle Range / ATR(14)** | Mengukur besar candle relatif terhadap volatilitas | Rasio ≥ 1 menjadi referensi impulse besar; bukan syarat wajib |
| **RVOL20** | Mengukur volume relatif terhadap rata-rata 20 candle | ≥ 1.10 menjadi referensi participation; nilai lebih rendah tidak otomatis menolak event |
| **Displacement** | Label kualitas impulse berdasarkan structural close, magnitude, dan participation | Bukan filter tambahan; evidence yang sama tidak dihitung ulang |

### Definisi perhitungan yang dikunci

- **Magnitude relatif = Candle Range / ATR(14)** pada timeframe yang sama.
- **RVOL20 = volume candle yang dinilai ÷ rata-rata volume 20 candle sebelumnya**.
- Candle yang dinilai **tidak dimasukkan** ke dalam rata-rata volume pembanding.
- Pengukuran 1D dan 4H dihitung terpisah menggunakan data timeframe masing-masing.

### Aturan final

- ATR dan RVOL tidak menentukan arah atau membatalkan event struktural.
- Tidak ada kewajiban simultan **Candle Range ≥ ATR(14) dan RVOL20 ≥ 1.10**.
- Referensi magnitude ≥ 1 dan RVOL20 ≥ 1.10 bukan hard gate, baik individual maupun gabungan.
- RVOL20 yang lebih rendah dari 1.10 dibaca sebagai evidence participation lebih lemah terhadap referensi tersebut, bukan penolakan otomatis.
- **Volume Z-Score tetap dihapus** karena menduplikasi RVOL.
- Displacement merupakan label kualitas impulse setelah event valid; tidak menjadi evidence independen tambahan atas input yang sama.
- Evidence magnitude dan participation tidak boleh dihitung berulang pada beberapa layer.
- Pullback tidak wajib memiliki momentum sebesar impulse.
- Volume pullback yang lebih rendah dari impulse sebelumnya menjadi konteks pendukung, bukan syarat wajib.

## 7. Poin 6 — Volatility Context

Status: FINAL — dikunci tanpa perubahan dari acuan awal.

- Membaca kondisi: **Contraction / Normal / Expansion**.
- **[QUANT] ATR Expansion:** hanya konteks regime; bukan syarat atau hard gate; tidak menentukan arah.
- Pemisahan fungsi: **Candle Range/ATR = magnitude candle; ATR Expansion = regime volatilitas; RVOL = participation**. Tidak boleh digabung menjadi satu gate.
- Struktur tidak boleh ditolak hanya karena Candle Range < 1× ATR(14).
- Tidak ada threshold numerik baru yang ditambahkan.

## 8. Poin 7 — Trading Plan

Status: FINAL — dikunci.

### 1. Kewenangan timeframe

- **1D–4H:** menentukan arah dan struktur utama.
- **4H:** menentukan zona entry struktural.
- **1H:** memperjelas zona dan memvalidasi entry; tidak membalik arah 1D–4H.

### 2. Definisi zona entry

Zona entry adalah **rentang harga dari struktur 4H tervalidasi**, berupa area pullback, breakout/retest, support/resistance struktural, atau swing relevan. Zona diperjelas pada 1H.

Hierarki: **Struktur → Zona Struktural → Premium/Discount → FVG**.

- Long prefer **Discount**; Short prefer **Premium**.
- FVG hanya mempersempit zona, bukan alasan entry mandiri.

### 3. Validasi entry 1H

| Arah | Konfirmasi |
|---|---|
| **Long** | Harga menguji zona, lalu candle 1H close menembus swing high internal yang terbentuk selama pengujian zona |
| **Short** | Harga menguji zona, lalu candle 1H close menembus swing low internal yang terbentuk selama pengujian zona |

Menyentuh zona saja belum cukup. Sebelum konfirmasi, status **menunggu validasi entry**. Volume hanya penguat.

### 4. Stop Loss

- Long: di bawah **protected Swing Low**.
- Short: di atas **protected Swing High**.
- SL berbasis struktur, bukan persentase tetap.
- SL adalah batas keluar posisi; **tidak menunggu konfirmasi break–retest**.

### 5. Target dan Risk:Reward

- Target mengacu pada level struktural berikutnya.
- Minimum **RR 1:2.2**, diperiksa kembali terhadap entry yang tervalidasi.
- Jika entry, SL, dan target struktural tidak memungkinkan RR tersebut: **NO TRADING PLAN**.

### 6. Pemisahan invalidasi

- **SL tercapai:** posisi keluar.
- **Struktur patah terkonfirmasi:** candle close melewati protected swing, lalu retest gagal merebut kembali level.
- SL tercapai tidak otomatis berarti struktur utama sudah patah terkonfirmasi.

## 9. Urutan proses yang dikunci

1. Tentukan cakupan kontrak perpetual USDT Binance USDⓈ-M Futures.
2. Ranking berdasarkan 24h Quote Volume dan pilih maksimal Top 250 dinamis.
3. Baca struktur 1D dan 4H untuk memvalidasi arah.
4. Ranking kandidat arah valid berdasarkan Quote Volume 60 menit berjalan.
5. Pilih maksimal Top 150 dan sertakan Trend Efficiency sebagai informasi kualitas.
6. Klasifikasikan status struktur pada masing-masing timeframe sesuai Poin 4, dengan acuan swing Poin 3.
7. Setelah event valid secara struktur, baca magnitude dan participation pada candle yang sudah close sesuai Poin 5.
8. Baca konteks volatilitas sesuai Poin 6 tanpa menjadikannya hard gate.
9. Tentukan zona struktural 4H, perjelas dan validasi entry pada 1H sesuai Poin 7.
10. Bentuk Trading Plan hanya jika entry, SL struktural, dan target struktural memenuhi minimum RR 1:2.2.

## 10. Prinsip kewenangan

- Market Structure menentukan arah.
- Quote Volume menentukan ranking kandidat.
- Trend Efficiency hanya informasi kualitas, tidak menentukan arah atau menggugurkan kandidat.
- EMA 21/30/50 memberikan informasi posisi harga saja.
- Volume memperkuat evidence break; tidak menentukan validitas melalui threshold wajib.
- Candle Range / ATR(14) mengukur magnitude; RVOL20 memberikan evidence participation. Keduanya tidak menjadi hard gate.
- Displacement memberi label kualitas impulse tanpa menghitung ulang evidence yang sama.
- Struktur patah dikonfirmasi melalui candle close melewati protected swing dan retest yang gagal merebut kembali level; arah berlawanan membutuhkan struktur valid.
- Trading Plan mengikuti Poin 7: zona struktural 4H, validasi entry 1H, SL dan target struktural, serta minimum RR 1:2.2.
- SL posisi tidak menunggu konfirmasi struktur patah melalui break–retest.
