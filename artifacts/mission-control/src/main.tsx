import { createRoot } from "react-dom/client";
import App from "./App";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import "./index.css";
import "./mission-ui.css";

setAuthTokenGetter(() => localStorage.getItem("mission_control_admin_token"));

createRoot(document.getElementById("root")!).render(<App />);
