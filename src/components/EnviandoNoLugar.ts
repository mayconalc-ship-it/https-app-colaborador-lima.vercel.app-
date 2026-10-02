"use client";

import { createContext } from "react";

/**
 * "Este formulário está enviando?" -- para o BotaoEnviar dentro de um
 * FormNoLugar. Lá o envio não passa por `<form action>`, então o
 * useFormStatus não o enxerga. Mora num arquivo à parte para o
 * BotaoEnviar, usado no app inteiro, não carregar o FormNoLugar junto.
 */
export const EnviandoNoLugar = createContext(false);
