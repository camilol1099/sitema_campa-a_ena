# Formato de Excel de la campaña

Reglas que aplica el código (`lib/campana.ts`) al importar desde el Asistente. El modelo no las razona:
solo interviene si el archivo **no** tiene este formato, o para decir qué filtro pidió la usuaria.

## Cómo se reconoce
- Una hoja con encabezados (pueden estar más abajo, p. ej. en la fila 8, con filas vacías arriba):
  `#, NOMBRE, CÉDULA, CELULAR, DIRECCIÓN, BARRIO, Puesto de Votación, Mesa, Municipio, Lider, Coordinador`.
- El orden puede variar. Se comparan sin tildes, mayúsculas ni espacios de más.
- Obligatorias: **NOMBRE, CÉDULA y Lider**. Las demás son opcionales.
- Si varias hojas tienen el formato, se pregunta cuál importar.

## Celdas
- `-` o vacío en cualquier celda = sin dato.
- `Municipio` es la verificación: `No se encuentra en el censo` = `No está en el censo`.
- Colores y formato de celdas se ignoran.

## Cédula (la misma regla en formularios, importación y asistente)
- Se quitan puntos, espacios, comas y apóstrofos (`1.065.821.234` → `1065821234`).
- Debe quedar solo con dígitos, entre 6 y 10. Si no: **problema** (la fila no se importa).
- **Aviso** (se importa, pero se marca): 9 dígitos que empiezan por `10`, o 10 dígitos que empiezan por `19`.
- Cédula repetida dentro del archivo: **problema** en la segunda fila.

## Líderes
- El mismo líder escrito con distintas mayúsculas o tildes es uno solo.
- **Fila del líder**: si `NOMBRE` normalizado == `Lider` normalizado, esa fila son los datos del líder,
  no una persona. Sus columnas completan al líder (cédula, celular, dirección, barrio, puesto, mesa,
  verificación, coordinador). Si se repite, las copias se omiten (no es un problema).
- Para no duplicar, cada líder del archivo se busca en la base:
  1. por la cédula de su fila de líder;
  2. por nombre normalizado exacto.
- Resultado:
  - **Líder nuevo**: no existe. Se crea con los datos de su fila; si no tiene fila, solo con el nombre.
  - **Líder a completar**: existe y le faltan datos que trae el archivo. Solo se llenan campos vacíos; nunca se sobrescribe.
  - **Problema "cédula del líder no coincide"**: existe con otra cédula. El líder no se toca
    (sus personas sí se vinculan a él, porque el nombre es el mismo).
  - **Posible mismo líder**: no existe igual, pero hay uno parecido (misma primera palabra y la segunda
    igual o con una letra de diferencia, p. ej. `Pedro Molina` / `Pedro Molinas`). No se crea, ni se
    importan sus personas, hasta que la usuaria elija en la vista previa "Es el mismo" o "Es otro".

## Personas
- Las demás filas de un líder son personas vinculadas a él; `Coordinador` va en el vínculo.
- **Una persona no puede ser líder**: si su cédula o su nombre normalizado es el de un líder (de la base
  o del archivo) y aparece bajo **otro** líder, no se crea; queda el aviso "es líder, aparece bajo X".
- Ya existe por cédula → "ya existe" (se omite). Si está con otro líder → aviso "ya está con X" (se omite).
- Sin cédula: si hay una persona con el mismo nombre normalizado y el mismo líder → "ya existe".
  La misma fila repetida bajo el mismo líder se omite (no es un problema).
- Sin `Lider` → aviso "sin líder"; se importa sin vínculo solo si la usuaria lo marca.

## Vista previa e importación
- Secciones: Líderes nuevos · Líderes a completar · Personas nuevas · Ya existen (omitidas) · Avisos · Problemas.
- Un solo "Importar": un lote con referentes, personas y vínculos. Los valores que se llenaron en líderes
  existentes quedan en `importaciones.cambios`; "Deshacer lote" los vuelve a dejar vacíos si nadie editó
  ese líder después.
- Filtros que puede pedir la usuaria: todo, solo líderes, solo líderes nuevos, solo personas, o solo los
  de ciertos líderes.
