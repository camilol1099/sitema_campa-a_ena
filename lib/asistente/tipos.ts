import type { TipoReferente } from "../ejes";
import type { FiltroCampana } from "../campana";
import type { Mapeo } from "../importacion";

// Tipos que comparten el servidor del asistente y el panel del navegador.

/** Mensaje visible del chat. Solo el texto viaja al modelo (máximo 20). */
export type MensajeChat = { rol: "user" | "assistant"; texto: string };

/**
 * Borrador de un cambio individual. No se guarda nada hasta que la usuaria
 * toca "Confirmar"; entonces el panel llama a la acción del formulario.
 */
export type Borrador =
  | {
      clase: "persona";
      accion: "crear" | "editar";
      registroId: string | null;
      titulo: string;
      /** Campos del formulario, como los enviaría el formulario. */
      datos: Record<string, string>;
      /** Solo al crear: a quién vincularla de una vez. */
      referente: { id: string; nombre: string } | null;
      coordinador: string | null;
      /** Lo que se muestra en la tarjeta. */
      campos: [string, string][];
    }
  | {
      clase: "referente";
      accion: "crear" | "editar";
      registroId: string | null;
      tipo: TipoReferente;
      titulo: string;
      datos: Record<string, string>;
      campos: [string, string][];
    }
  | {
      clase: "vinculo";
      titulo: string;
      persona: { id: string; nombre: string };
      referente: { id: string; nombre: string };
      coordinador: string | null;
      campos: [string, string][];
    };

/** Eventos que el servidor envía al panel, uno por línea (JSON). */
export type Evento =
  | { tipo: "texto"; texto: string }
  | { tipo: "estado"; texto: string }
  | { tipo: "borrador"; borrador: Borrador }
  | { tipo: "mapeo"; mapeo: Mapeo }
  /** Formato de la campaña reconocido en código: el modelo solo dio el filtro. */
  | { tipo: "importar_campana"; hoja: string; filtro: FiltroCampana }
  | { tipo: "error"; texto: string }
  | { tipo: "fin" };
