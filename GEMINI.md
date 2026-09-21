# 📌 Reglas de Workspace y Memoria de Proyecto: Politécnica ASBANC

> **ATENCIÓN AGENTE / ASISTENTE:**  
> Este repositorio cuenta con una **Memoria de Proyecto Viva** que rige toda la arquitectura, diseño, componentes, bitácora y registro de cambios:  
> 📁 **[`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md)**

---

## 🚨 PROTOCOLO OBLIGATORIO DE SESIÓN

### 1. Lectura Obligatoria al Iniciar Cada Sesión
- **Acción Ineludible**: Al iniciar cualquier sesión de trabajo, o antes de planificar/ejecutar cualquier tarea o cambio en este repositorio, el agente **DEBE leer [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md)**.
- **Objetivo**: Garantizar que el asistente esté 100% alineado con la arquitectura, el catálogo de componentes, las decisiones previas (ADR), el log de cambios reciente y el estado actual del roadmap.

### 2. Actualización Obligatoria en CADA Cambio del Proyecto
- **Acción Ineludible**: Tras realizar cualquier modificación en el proyecto (creación de archivos, refactorización, cambio de configuración, instalación de dependencias o corrección de bugs), el agente **DEBE actualizar [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md)** antes de dar por finalizada la tarea:
  - 📝 **Log de Cambios (Sección 7)**: Agregar una entrada cronológica con formato:
    `[YYYY-MM-DD] [TIPO] | Componente: Descripción concisa y técnica del cambio. (Archivos modificados)`
  - 🧩 **Componentes (Sección 4)**: Si se añadieron o modificaron módulos o servicios, reflejarlos en la tabla de componentes.
  - 🏛️ **Arquitectura y Diseño (Sección 3)**: Si hubo modificaciones en flujos de datos o estructura, actualizar los diagramas o directrices.
  - 📜 **Bitácora de Decisiones (Sección 6)**: Si se tomó una decisión de diseño relevante o de arquitectura, registrar un nuevo ADR (Architecture Decision Record).
  - 🚀 **Roadmap (Sección 9)**: Marcar como completadas las tareas correspondientes y listar siguientes pasos.

---

## 🎯 Contexto Rápido del Proyecto
- **Nombre:** Politécnica ASBANC (`politecnica-asbanc`)
- **Organización:** Politécnica (`politecnica.edu.pe`) / ASBANC
- **Propósito:** Plataforma y servicios de integración institucional bancaria y académica.
- **Memoria Principal:** [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md) (y alias [`MEMORY.md`](./MEMORY.md)).
