# Instrucciones de Trabajo para CDLRadar v5.8

## Reglas de Disciplina

### 1. NO ROMPER NADA
- Antes de modificar código existente, leer y entender el contexto completo
- Preservar toda funcionalidad existente
- Probar que nada se rompe después de cada cambio

### 2. NO CREAR COSAS NUEVAS SIN AUTORIZACIÓN
- No crear nuevos archivos sin que se solicite explícitamente
- No agregar nuevas dependencias sin autorización
- No implementar características no solicitadas

### ZONAS PROHIBIDAS (A menos que se especifique explícitamente)

#### 🚫 LÓGICA DE SEÑALES - NO TOCAR
- **NO modificar** la lógica de razonamiento de cómo el sistema evalúa las señales
- **NO cambiar** algoritmos en `strategies/` (fastScalp, macdUlt, smcLux, sqzMom, zenTrend)
- **NO alterar** `utils/tradingLogic.ts` - Lógica de trading
- **NO modificar** `utils/indicators.ts` - Cálculos de indicadores
- **NO cambiar** condiciones de entrada/salida de posiciones

#### 🎨 ESTÉTICA Y UI - NO TOCAR
- **NO cambiar** colores, estilos, temas
- **NO modificar** iconografía ni emojis existentes
- **NO mover** posición de elementos UI
- **NO agregar** ni quitar botones
- **NO cambiar** layout de componentes
- **NO modificar** tamaños, espaciados, alineaciones
- **NO alterar** animaciones o transiciones existentes

### 3. DETENTE Y CONSULTA ANTES DE ACTUAR
- Antes de hacer cualquier cambio significativo, describir el plan de forma clara y humana
- Esperar confirmación del usuario antes de proceder
- Explicar las implicaciones de cada cambio propuesto

### 4. COMMIT Y PUSH CADA ACCIÓN
- Después de cada cambio completado, crear un commit con mensaje descriptivo
- Hacer push inmediatamente después de commit
- Formato de commits: tipo(scope): descripción breve
  - Ejemplo: `fix(Radar): corrige actualización de precios`
  - Ejemplo: `feat(indicators): agrega nueva señal de tendencia`

## Workflow de Trabajo

1. **Recibir solicitud** → Entender el requerimiento
2. **Analizar impacto** → Revisar qué archivos se verán afectados
3. **Proponer plan** → Describir exactamente qué se hará
4. **Esperar confirmación** → No proceder sin aprobación
5. **Implementar cambio** → Hacer la modificación específica solicitada
6. **Commit + Push** → Guardar y sincronizar cambios
7. **Confirmar resultado** → Verificar que todo funciona

## Principios de Código

- **Minimalismo**: Solo el código necesario, nada más
- **Conservación**: Preservar patrones y estructura existente
- **Claridad**: Código legible y mantenible
- **Seguridad**: No exponer datos sensibles

## Estructura del Proyecto

- `components/`: Componentes React principales
- `strategies/`: Lógica de estrategias de trading
- `services/`: Servicios externos (Supabase, TwelveData)
- `utils/`: Utilidades y helpers
- `api/`: Funciones serverless para Netlify

---
**Última actualización**: 24 de marzo de 2026
