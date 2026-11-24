//! appsign keygen <private-file>          writes a new private key (hex), prints the public key (hex)
//! appsign sign <private-file> <message>  prints the signature (hex) of the message text
//! appsign sha256 <file>                  prints the SHA-256 (hex) of a file
use ed25519_dalek::{Signer, SigningKey};
use sha2::{Digest, Sha256};

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}
fn unhex(s: &str) -> Vec<u8> {
    (0..s.len() / 2).filter_map(|i| u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).ok()).collect()
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    match a.get(1).map(String::as_str) {
        Some("keygen") => {
            let path = &a[2];
            if std::path::Path::new(path).exists() {
                eprintln!("{path} exists: not overwritten");
                std::process::exit(1);
            }
            let k = SigningKey::generate(&mut rand_core::OsRng);
            std::fs::write(path, hex(&k.to_bytes())).unwrap();
            println!("{}", hex(k.verifying_key().as_bytes()));
        }
        Some("sign") => {
            let k = SigningKey::from_bytes(&unhex(std::fs::read_to_string(&a[2]).unwrap().trim()).try_into().expect("a 32-byte key"));
            println!("{}", hex(&k.sign(a[3].as_bytes()).to_bytes()));
        }
        Some("sha256") => {
            println!("{}", hex(&Sha256::digest(std::fs::read(&a[2]).unwrap())));
        }
        _ => {
            eprintln!("usage: appsign keygen <file> | sign <key-file> <message> | sha256 <file>");
            std::process::exit(2);
        }
    }
}
