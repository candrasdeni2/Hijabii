// Pembantu UI panel Admin. Memakai kit bersama (assets/js/panel-kit.js) dengan prefiks kelas "ad-".
import { createPanelKit, esc, fmtDate, debounce, copyText, setBusy, wireCopy } from "../assets/js/panel-kit.js";

const kit = createPanelKit("ad");
export { esc, fmtDate, debounce, copyText, setBusy, wireCopy };
export const { openModal, confirmDialog, modeCards, secretPanel } = kit;
