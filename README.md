# AULIVRA

AULIVRA es un starter funcional de una plataforma académica con cinco módulos: conversión de documentos, calculadora de notas, enlaces temporales para compartir archivos, biblioteca de recursos y temporizador de estudio.

## Requisitos

- Node.js 20 o superior.
- LibreOffice instalado en el servidor para conversiones generales de documentos (`soffice` en PATH).
- Para envío real de correos: una cuenta SMTP.
- Para producción: HTTPS, almacenamiento persistente y un proveedor de almacenamiento adecuado para archivos grandes.

## Arranque local

```bash
npm install
cp .env.example .env
npm start
```

Abre http://localhost:3000.

## Funcionalidades

### 1. Conversor
- Conversión servidor-a-servidor mediante LibreOffice para los formatos que este soporte.
- Unión de PDF y optimización básica en el navegador mediante PDF-Lib.
- El conversor devuelve un error explicativo si LibreOffice no está instalado o no soporta el formato solicitado.

### 2. Calculadora de notas
- Criterios editables y notas de 0 a 10.
- Comprueba que los pesos sumen 100%.
- Guarda plantillas y el historial en `localStorage` del navegador.
- Los datos no se sincronizan entre dispositivos ni usuarios en esta versión.

### 3. Compartir archivos
- Subida al servidor, enlace aleatorio y caducidad de 24 h, 72 h o 7 días.
- Envío opcional mediante SMTP.
- Los archivos se guardan en `data/uploads`; metadatos en `data/shares.json`.
- Configura `PUBLIC_BASE_URL` con la URL pública real al desplegar detrás de un proxy.

### 4. Biblioteca académica
- Accesos a búsquedas de apuntes en Wuolah y a recursos educativos externos.
- No descarga ni replica contenido de terceros. Comprueba licencias, derechos y condiciones de cada recurso.
- El selector de archivos personales solo muestra la selección en esta versión; no los sube.

### 5. Temporizador
- Pomodoro 25/5, 50/10, 90/15 y bloques personalizados.
- Guarda sesiones completadas en `localStorage`.

## Despliegue y seguridad antes de producción

Esta entrega es una base de producto ejecutable, no un servicio SaaS multiusuario listo para cobrar. Antes de abrirlo al público:

1. Sustituye `localStorage` por autenticación y base de datos (por ejemplo, PostgreSQL) con aislamiento por usuario.
2. Usa almacenamiento de objetos (S3 compatible) para archivos, enlaces firmados y políticas de expiración; no dependas del disco efímero de un hosting.
3. Configura SMTP y un dominio propio con SPF, DKIM y DMARC.
4. Añade escaneo antimalware, cuotas, límites por usuario, protección contra abuso, registro de auditoría y borrado seguro.
5. Mantén LibreOffice aislado en un contenedor de conversión con límites de CPU, memoria y tiempo.
6. Configura HTTPS, proxy de confianza, copias de seguridad y monitorización.
7. Revisa derechos y licencias de los apuntes enlazados.

## Variables de entorno

Consulta `.env.example`.
