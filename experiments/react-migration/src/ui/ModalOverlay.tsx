import { useEffect, useRef } from "react";
import { createModalOverlay } from "./createModalOverlay";

export const ModalOverlay = createModalOverlay(useEffect, useRef);
