// Pembantu UI panel Super Admin. Isinya kini dipakai bersama dengan panel Admin (assets/js/panel-kit.js);
// berkas ini hanya menyetel prefiks kelas "sa-" supaya tampilan panel Super Admin tidak berubah.
import { createPanelKit, esc, fmtDate, debounce, copyText, setBusy, wireCopy } from "../assets/js/panel-kit.js";

const kit = createPanelKit("sa");
export { esc, fmtDate, debounce, copyText, setBusy, wireCopy };
export const { openModal, confirmDialog, modeCards, secretPanel } = kit;