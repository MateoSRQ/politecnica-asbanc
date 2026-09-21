#!/usr/bin/env bash
# ==============================================================================
# Script: create-v1-commit-and-branch.sh
# Descripción: Crea el commit de la versión estable v1.0.0, genera el tag v1.0.0
#              y crea/conmuta a la rama 'feature/optimization'.
# ==============================================================================

set -e # Detener ejecución ante cualquier error

echo "======================================================================"
echo "🚀 INICIANDO PROCESO DE RELEASE v1.0.0 Y CREACIÓN DE RAMA"
echo "======================================================================"

# 1. Asegurar que estamos en el directorio raíz del repositorio
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "📂 Directorio del repositorio: $REPO_DIR"

# 2. Verificar estado actual de Git
echo ""
echo "🔍 1. Verificando cambios pendientes en Git..."
git status --short

# 3. Agregar todos los archivos al área de preparación (stage)
echo ""
echo "📦 2. Agregando archivos al staging de Git..."
git add -A

# 4. Crear el commit de la versión 1.0.0
echo ""
echo "💾 3. Creando commit de la versión v1.0.0..."
git commit -m "feat(release): v1.0.0 - Pasarela Transaccional ASBANC FTR / BDACADEMICO6

- Implementación completa de endpoints On-Host: ValidateCustomer, ListDebts, PayDebt, ReversePay
- Servicio emisor de tokens OAuth 2.0 / JWT (HS256) según Pág. 8 Guía V47
- Integración transaccional con BDACADEMICO6 (prelación por cuota/periodo, pagos ACID e idempotencia)
- Blindaje de auditoría forense persistente en MSSQL y telemetría Prometheus (/metrics)
- Suite interactiva TESTAPI.http y catálogo canónico en API.md
- Batería de pruebas automatizadas en Vitest con 96 tests pasando al 100%"

# 5. Crear el tag v1.0.0 (si no existe aún)
echo ""
echo "🏷️  4. Generando tag anotado v1.0.0..."
if git rev-parse "v1.0.0" >/dev/null 2>&1; then
    echo "⚠️  El tag v1.0.0 ya existía. Actualizando anotación..."
    git tag -a -f v1.0.0 -m "Release v1.0.0: Pasarela Transaccional ASBANC FTR / BDACADEMICO6"
else
    git tag -a v1.0.0 -m "Release v1.0.0: Pasarela Transaccional ASBANC FTR / BDACADEMICO6"
    echo "✅ Tag v1.0.0 creado con éxito."
fi

# 6. Crear y cambiar a la rama feature/optimization
echo ""
echo "🌿 5. Creando y conmutando a la rama 'feature/optimization'..."
if git show-ref --verify --quiet refs/heads/feature/optimization; then
    echo "⚠️  La rama 'feature/optimization' ya existía. Conmutando a ella..."
    git checkout feature/optimization
else
    git checkout -b feature/optimization
    echo "✅ Rama 'feature/optimization' creada y activa."
fi

# 7. Resumen final
echo ""
echo "======================================================================"
echo "🎉 PROCESO COMPLETADO EXITOSAMENTE"
echo "======================================================================"
echo "📌 Rama actual activa:"
git branch --show-current
echo ""
echo "📜 Último commit realizado:"
git log -1 --oneline --decorate
echo ""
echo "🏷️  Tags disponibles:"
git tag -l -n1 "v1*"
echo "======================================================================"
