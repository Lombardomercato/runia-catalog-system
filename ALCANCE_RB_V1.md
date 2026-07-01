# Alcance RB V1

Este documento define el alcance de la primera version de Runia Catalog System para RB Distribuidora.

RB Distribuidora es el cliente inicial y la primera implementacion comercial del producto. La solucion debe cubrir sus necesidades operativas iniciales sin bloquear la reutilizacion del sistema para futuros clientes.

## Objetivo de V1

Entregar un catalogo digital funcional que permita a clientes finales y mayoristas consultar productos, armar un pedido y enviarlo por WhatsApp, mientras RB Distribuidora puede administrar productos, categorias y usuarios mayoristas desde un panel.

## Incluye

### Catalogo publico

- Home o vista principal de catalogo.
- Listado de productos activos.
- Visualizacion por categorias.
- Buscador de productos.
- Detalle de producto.
- Precio de consumidor final visible publicamente.
- Funcionamiento correcto aunque los productos no tengan foto.

### Carrito y pedido

- Agregar productos al carrito.
- Modificar cantidades.
- Quitar productos.
- Ver resumen del pedido.
- Generar mensaje de pedido para WhatsApp.
- Abrir WhatsApp con el mensaje prearmado.

### Login mayorista

- Login para usuarios mayoristas.
- Precios mayoristas visibles solo con sesion iniciada.
- Separacion clara entre precio publico y precio mayorista.
- Usuarios mayoristas gestionados desde el panel administrador.

### Panel administrador

- Acceso restringido para administradores.
- Gestion de productos.
- Gestion de categorias.
- Gestion de usuarios mayoristas.
- Alta, edicion, activacion y desactivacion de productos.
- Alta, edicion y ordenamiento basico de categorias.
- Importacion de productos desde Google Sheets o Excel.

### Carga inicial

- Carga inicial de productos de RB Distribuidora.
- La carga inicial no incluye fotos de productos.
- Google Sheets sera la fuente principal para ordenar, revisar e importar datos iniciales.

## No incluye

- Fotos de productos.
- Pagos online.
- Facturacion.
- Stock avanzado.
- App nativa.
- Automatizacion de WhatsApp.
- CRM.
- Sistema de gestion completo.
- Integraciones contables.
- Integraciones con proveedores.
- Gestion avanzada de promociones.
- Logistica o seguimiento de envios.

## Supuestos

- RB Distribuidora proveera la informacion base de productos, categorias y precios.
- Los pedidos se cerraran manualmente por WhatsApp.
- El stock, si existe en V1, sera solo informativo o no estara disponible.
- Los productos podran publicarse sin imagen.
- El catalogo debe estar optimizado para uso mobile.

## Criterios de aceptacion

- Un visitante puede ver categorias, buscar productos y consultar detalles.
- Un visitante puede ver precios de consumidor final.
- Un mayorista autenticado puede ver precios mayoristas.
- Un usuario puede armar un carrito y enviar el pedido por WhatsApp.
- Un administrador puede crear, editar, activar y desactivar productos.
- Un administrador puede crear y editar categorias.
- Un administrador puede gestionar usuarios mayoristas.
- Se puede importar un lote inicial de productos desde Google Sheets o Excel.
- El sistema queda deployado y usable para RB Distribuidora.

## Fuera de alcance para evitar ambiguedad

Runia Catalog System V1 no reemplaza al sistema de gestion interno de RB Distribuidora. Su funcion principal es catalogo, recepcion de pedidos y administracion basica del contenido publicado.
