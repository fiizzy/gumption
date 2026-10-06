import { createContext } from "react";
import type { ChatStyle } from "./useSettings";

// App-wide chat card look. A context rather than per-node data so switching
// it doesn't rebuild every node's hydrated data.
export const ChatStyleContext = createContext<ChatStyle>("standard");
