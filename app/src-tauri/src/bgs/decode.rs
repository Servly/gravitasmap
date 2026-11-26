//! BGS Watch, image decoding: BMP by hand (24 and 32 bit, bottom-up and top-down) and PNG through tiny-skia (already in the app).
//! Plain memory work, never a write. Anything else is refused with a clear message, never a panic.
#[derive(Debug)]
pub struct Rgb {
    pub w: usize,
    pub h: usize,
    /// R, G, B interleaved
    pub px: Vec<u8>,
}

/// a screenshot file far bigger than any real one is not read
pub const MAX_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_DIM: usize = 8192;
pub const MAX_PIXELS: usize = 40_000_000;

fn u16le(b: &[u8], o: usize) -> Option<u16> { b.get(o..o + 2).map(|s| u16::from_le_bytes([s[0], s[1]])) }
fn u32le(b: &[u8], o: usize) -> Option<u32> { b.get(o..o + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]])) }
fn u32be(b: &[u8], o: usize) -> Option<u32> { b.get(o..o + 4).map(|s| u32::from_be_bytes([s[0], s[1], s[2], s[3]])) }

fn check_dims(w: usize, h: usize) -> Result<(), String> {
    if w == 0 || h == 0 { return Err("the picture has no size".into()); }
    if w > MAX_DIM || h > MAX_DIM || w.saturating_mul(h) > MAX_PIXELS { return Err(format!("the picture is too large ({w} x {h})")); }
    Ok(())
}

pub fn decode(bytes: &[u8]) -> Result<Rgb, String> {
    if bytes.starts_with(b"BM") { decode_bmp(bytes) }
    else if bytes.starts_with(&[0x89, 0x50, 0x4e, 0x47]) { decode_png(bytes) }
    else { Err("this is not a BMP or PNG picture (set the game's screenshot format to BMP or PNG)".into()) }
}

pub fn decode_bmp(b: &[u8]) -> Result<Rgb, String> {
    let bad = || "the BMP file is damaged or cut off".to_string();
    let off = u32le(b, 10).ok_or_else(bad)? as usize;
    let dib = u32le(b, 14).ok_or_else(bad)? as usize;
    if dib < 40 { return Err("this BMP header type is not supported".into()); }
    let w = u32le(b, 18).ok_or_else(bad)? as i32;
    let hh = u32le(b, 22).ok_or_else(bad)? as i32;
    let planes = u16le(b, 26).ok_or_else(bad)?;
    let bpp = u16le(b, 28).ok_or_else(bad)?;
    let comp = u32le(b, 30).ok_or_else(bad)?;
    if planes != 1 { return Err("this BMP is not supported".into()); }
    if bpp != 24 && bpp != 32 { return Err(format!("this BMP has {bpp} bits per pixel: only 24 and 32 are supported")); }
    if w <= 0 || hh == 0 || hh == i32::MIN { return Err("the BMP has no size".into()); }
    let top_down = hh < 0;
    let (w, h) = (w as usize, hh.unsigned_abs() as usize);
    check_dims(w, h)?;
    match comp {
        0 => {}
        3 if bpp == 32 => {
            // BI_BITFIELDS: only the usual B8G8R8A8 layout
            let m = |o| u32le(b, o).ok_or_else(bad);
            if !(m(54)? == 0x00ff_0000 && m(58)? == 0x0000_ff00 && m(62)? == 0x0000_00ff) { return Err("this BMP colour layout is not supported".into()); }
        }
        _ => return Err("this BMP is compressed: not supported".into()),
    }
    let bytes_pp = (bpp / 8) as usize;
    let stride = (w.checked_mul(bpp as usize).ok_or_else(bad)?.div_ceil(32)).checked_mul(4).ok_or_else(bad)?;
    let need = stride.checked_mul(h).and_then(|n| n.checked_add(off)).ok_or_else(bad)?;
    if off < 14 + 40 || need > b.len() { return Err(bad()); }
    let mut px = vec![0u8; w * h * 3];
    for y in 0..h {
        let sy = if top_down { y } else { h - 1 - y };
        let row = &b[off + sy * stride..off + sy * stride + w * bytes_pp];
        let out = &mut px[y * w * 3..(y + 1) * w * 3];
        for (x, p) in row.chunks_exact(bytes_pp).enumerate() {
            out[x * 3] = p[2];
            out[x * 3 + 1] = p[1];
            out[x * 3 + 2] = p[0];
        }
    }
    Ok(Rgb { w, h, px })
}

pub fn decode_png(b: &[u8]) -> Result<Rgb, String> {
    // the size is read from the header first: a tiny file can claim a huge picture
    let w = u32be(b, 16).ok_or("the PNG file is cut off")? as usize;
    let h = u32be(b, 20).ok_or("the PNG file is cut off")? as usize;
    check_dims(w, h)?;
    let pm = tiny_skia::Pixmap::decode_png(b).map_err(|_| "the PNG file could not be read".to_string())?;
    let (w, h) = (pm.width() as usize, pm.height() as usize);
    check_dims(w, h)?;
    let mut px = Vec::with_capacity(w * h * 3);
    for p in pm.data().chunks_exact(4) { px.extend_from_slice(&p[..3]); }
    Ok(Rgb { w, h, px })
}

/// A file read with plain read access only (never write, never lock), at most MAX_BYTES.
pub fn read_file(p: &std::path::Path) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let f = std::fs::OpenOptions::new().read(true).open(p).map_err(|e| format!("could not open: {e}"))?;
    let len = f.metadata().map(|m| m.len()).map_err(|e| format!("could not read: {e}"))?;
    if len > MAX_BYTES { return Err("the file is larger than 64 MB".into()); }
    let mut v = Vec::with_capacity(len as usize);
    f.take(MAX_BYTES + 1).read_to_end(&mut v).map_err(|e| format!("could not read: {e}"))?;
    Ok(v)
}

pub fn decode_file(p: &std::path::Path) -> Result<Rgb, String> { decode(&read_file(p)?) }
