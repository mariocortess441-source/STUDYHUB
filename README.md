# ROOM — tu espacio personal en 3D

ROOM convierte una habitación 3D en el centro de control de tus estudios, proyectos, lecturas, ropa, descanso, experiencias, hábitos e ideas.

## Desarrollo
- Node.js 20+
- Express sirve la aplicación desde `public/`.
- Three.js se carga como módulo ES desde jsDelivr.
- Los elementos que añadas se guardan localmente en el navegador mediante localStorage.

## Ejecutar
```bash
npm install
npm start
```

La aplicación estará disponible en el puerto definido por `PORT` (3000 por defecto).

## Interacción
Pulsa los objetos de la habitación para abrir su espacio. Puedes añadir elementos, marcarlos como completados y eliminarlos. La vista 3D permite arrastrar para girar la cámara y usar la rueda para acercar o alejar.
