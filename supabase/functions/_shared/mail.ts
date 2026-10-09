// TODO: sambungkan ke provider SMTP/API email setelah diputuskan (secrets MAIL_*).
// Selama belum, kembalikan false -> respons tetap sukses dengan mail_sent:false.
export async function sendMail(_to: string, _subject: string, _text: string): Promise<boolean> {
  return false;
}
