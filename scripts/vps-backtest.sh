#!/usr/bin/env bash
# Jalankan backtest ICT di data futures Binance ASLI (data publik) — dirancang untuk VPS yang tidak memblokir Binance.
#
# TIDAK membutuhkan API key. Skrip ini tidak membaca, meminta, atau mengirim kredensial apa pun.
# Yang dikirim ke Binance hanya permintaan data pasar publik (ping, ticker/24hr, klines).
#
# Pakai:   bash scripts/vps-backtest.sh
# Opsi:    PAIRS=30 HISTORY=4000 bash scripts/vps-backtest.sh      (jumlah pair, jumlah candle LTF per pair)
# Lama:    puluhan menit (dominan komputasi). Disarankan di dalam tmux/screen atau: nohup bash scripts/vps-backtest.sh &
# Hasil:   results/<waktu>/RINGKASAN.txt  <- tempel isi berkas ini ke Claude untuk dianalisis (tidak berisi data pribadi)
set -euo pipefail
cd "$(dirname "$0")/.."

PAIRS="${PAIRS:-30}"
HISTORY="${HISTORY:-4000}"
FAPI_BASE="${FAPI_BASE:-https://fapi.binance.com}"   # hanya untuk pengujian skrip ini terhadap server tiruan; biarkan default
OUT="results/$(date +%Y%m%d-%H%M)"
mkdir -p "$OUT"

echo "== Node: $(node --version)"
node -e 'process.exit(+process.versions.node.split(".")[0] >= 18 ? 0 : 1)' || { echo "Butuh Node >= 18 (fetch bawaan)."; exit 1; }

if [ -n "${BINANCE_API_KEY:-}${BINANCE_SECRET:-}${BINANCE_API_SECRET:-}" ]; then
  echo "(catatan: ada variabel BINANCE_* di environment — skrip ini TIDAK memakainya dan tidak membutuhkannya)"
fi

echo "== 1/4 cek koneksi ke Binance futures (publik)"
if ! curl -fsS -m 10 "$FAPI_BASE/fapi/v1/ping" >/dev/null; then
  echo "GAGAL: $FAPI_BASE tidak terjangkau dari VPS ini (diblokir wilayah/ISP?)."
  echo "Hasil dengan data spot tetap bisa dijalankan manual: node scripts/backtest-ict.js --source=spot"
  exit 2
fi
echo "OK"

echo "== 2/4 preflight kecil (2 pair) — memastikan jalur futures benar sebelum run panjang"
node scripts/backtest-ict.js --source=futures --futures-base="$FAPI_BASE" --pairs=2 --history=1500 --style=intraday | head -4

echo "== 3/4 backtest penuh (futures asli, $PAIRS pair, $HISTORY candle LTF)"
for style in intraday swing; do
  node scripts/backtest-ict.js --source=futures --futures-base="$FAPI_BASE" --pairs="$PAIRS" --style="$style" --history="$HISTORY" \
    --dump="$OUT/dump-$style.jsonl" | tee "$OUT/backtest-$style.txt"
done

echo "== 4/4 analisis fitur (latih vs uji)"
node scripts/analyze-features.js "$OUT/dump-intraday.jsonl" "$OUT/dump-swing.jsonl" --min-n=200 | tee "$OUT/features.txt"

{
  echo "# Ringkasan backtest ICT — futures USDT-M asli — $(date -u +%Y-%m-%dT%H:%MZ)"
  echo "# pair=$PAIRS history=$HISTORY node=$(node --version) commit=$(git rev-parse --short HEAD 2>/dev/null || echo ?)"
  echo; cat "$OUT/backtest-intraday.txt"; echo; cat "$OUT/backtest-swing.txt"; echo; cat "$OUT/features.txt"
} > "$OUT/RINGKASAN.txt"

echo
echo "SELESAI. Tempel isi berkas ini ke Claude:  $OUT/RINGKASAN.txt   ($(wc -c < "$OUT/RINGKASAN.txt") byte)"
