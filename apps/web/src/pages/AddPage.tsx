import { useNavigate } from "@tanstack/react-router";
import { useOnline } from "../api/useOnline";
import { AddScreen } from "./add/AddScreen";

/** Where a recipe starts. Typing one in opens the editor; importing from a link arrives with T1.12. */
export function AddPage() {
  const navigate = useNavigate();
  const online = useOnline();
  return <AddScreen offline={!online} onType={() => navigate({ to: "/recipes/new" })} />;
}
