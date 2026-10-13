import { initPeoplePage } from "../people.js";
export const init = ({ root }) => initPeoplePage({ root, role: "admin", noun: "admin", canCreate: true, canDelete: true });
