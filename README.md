# Cuaderno de Mantenimiento (v6 móvil)

App HTML/JS/CSS lista para móvil (Cordova/WebView o navegador).

## Páginas (barra inferior)
- **Registros**: lista, búsqueda, filtro de pendientes, editar/borrar, KPIs.
- **Nuevo**: formulario completo con materiales y trabajos múltiples (+/-).
- **Horas extra**: Total horas extra (automático), Total horas cobradas (manual), Balance (automático).
- **Backup**: Exportar/Importar JSON, Copiar backup al portapapeles y Restaurar pegando.
- **Ajustes**: info.

## Datos (localStorage)
- `mantenimiento_registros_v1` (registros normalizados)
- `mantenimiento_trabajos_v1` (compatibilidad con versiones anteriores)
- `mantenimiento_extra_pagos_v1` (pagos de horas cobradas)

## Cómo ejecutar
Abre `index.html` en el navegador o dentro de tu WebView/Cordova.

## Nota
La restauración por “Pegar / Restaurar” acepta:
- JSON de backup (formato `storage` o `data`)
- Tabla copiada desde Excel (TSV) si incluye cabeceras tipo “Fecha”, “Empresa”, etc.

## Sincronización Firebase entre dispositivos

Esta versión incorpora una capa de sincronización automática con Firebase Realtime Database:

- ID único persistente por dispositivo (`DEVICE-XXXXXXXX`).
- Botón flotante **SINCRONIZAR**.
- Modal con ID del dispositivo, campo para introducir el ID del otro dispositivo y botón **EMPAREJAR**.
- Sincronización bidireccional automática una vez emparejados.
- Confirmación automática de recepción mediante `acks` en Firebase.
- Resolución de conflictos por `updatedAt` / `modificadoEn`: gana la versión más reciente.
- localStorage se mantiene como espejo offline.
- Importación JSON/Excel compatible: conserva el ID de sincronización y sube los cambios al emparejado si Firebase está configurado.

### Configuración necesaria

Antes de usar Firebase, abre:

`modules/firebaseConfig.js`

y sustituye los valores `PEGA_AQUI_...` por la configuración real de tu proyecto Firebase Web App.

Debe estar activado **Firebase Realtime Database**. Si ese archivo no tiene claves reales, la app seguirá funcionando offline, pero el indicador mostrará **Firebase no configurado**.

### Reglas de prueba recomendadas en Firebase Realtime Database

Para pruebas privadas puedes usar temporalmente reglas abiertas mientras verificas el funcionamiento:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

Después conviene endurecerlas antes de un uso público.
