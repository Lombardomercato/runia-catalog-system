# Roadmap

Este roadmap organiza el desarrollo de Runia Catalog System desde la primera implementacion para RB Distribuidora hacia un producto reutilizable para nuevos clientes.

## Fase 0 - Documentacion y definicion

Estado: inicial.

- Crear documentacion base del proyecto.
- Definir alcance V1 para RB Distribuidora.
- Definir modelo de datos inicial.
- Confirmar stack tecnico.
- Validar fuente de datos inicial: Google Sheets o Excel.

## Fase 1 - Base tecnica

- Crear proyecto Next.js.
- Configurar Supabase.
- Configurar autenticacion.
- Definir roles iniciales: administrador, mayorista y visitante.
- Crear migraciones iniciales.
- Configurar Vercel.
- Definir variables de entorno.

## Fase 2 - Catalogo publico

- Crear vista de catalogo.
- Crear listado de categorias.
- Crear buscador.
- Crear detalle de producto.
- Mostrar precios de consumidor final.
- Resolver estados sin foto de producto.
- Optimizar experiencia mobile.

## Fase 3 - Login mayorista y precios

- Implementar login.
- Proteger precios mayoristas.
- Asociar usuarios a rol mayorista.
- Validar comportamiento publico vs. autenticado.

## Fase 4 - Carrito y pedido por WhatsApp

- Crear carrito.
- Permitir edicion de cantidades.
- Generar resumen de pedido.
- Formatear mensaje de WhatsApp.
- Abrir pedido en WhatsApp con datos prearmados.

## Fase 5 - Panel administrador

- Crear layout de administracion.
- Gestionar productos.
- Gestionar categorias.
- Gestionar usuarios mayoristas.
- Activar y desactivar productos.
- Preparar vistas para mantenimiento rapido de datos.

## Fase 6 - Importacion de productos

- Definir formato de Google Sheets.
- Implementar importacion desde Sheets o Excel.
- Validar columnas requeridas.
- Reportar errores de importacion.
- Ejecutar carga inicial de RB Distribuidora.

## Fase 7 - Implementacion RB Distribuidora

- Cargar productos iniciales sin fotos.
- Configurar datos del cliente.
- Configurar numero de WhatsApp de destino.
- Hacer pruebas de catalogo, carrito, login y panel.
- Deploy productivo.
- Capacitar uso basico del panel.

## Fase 8 - Producto reutilizable

- Separar configuracion por cliente.
- Documentar onboarding de nuevos clientes.
- Revisar nombres, textos y parametros hardcodeados.
- Preparar plantillas de carga.
- Definir estrategia multi-cliente o clon por cliente.

## Futuras versiones posibles

- Fotos de productos.
- Control de stock simple.
- Promociones.
- Multiples listas de precios.
- Pedidos guardados en base de datos.
- Historial de pedidos por mayorista.
- Estados de pedido.
- Panel de metricas.
- Integraciones con sistemas externos.
- Automatizaciones operativas.

## Prioridad actual

La prioridad es completar V1 para RB Distribuidora sin agregar funcionalidades fuera de alcance. Cada decision tecnica debe favorecer que Runia Catalog System pueda repetirse con otros clientes.
