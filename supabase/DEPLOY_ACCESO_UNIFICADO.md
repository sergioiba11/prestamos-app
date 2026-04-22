# Deploy y validación - Acceso unificado

Este documento deja listo el deploy de:

- `registro-cliente-publico`
- `resolver-identificador-login`

## 1) Variables/secrets requeridos

### Edge Functions (runtime Supabase)

Estas funciones requieren:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

> Nota: en Supabase Functions, `SUPABASE_URL` suele estar disponible por defecto, pero se recomienda setear ambas explícitamente para evitar diferencias entre entornos.

### Frontend (Expo)

Para recuperación de contraseña con redirección explícita:

- `EXPO_PUBLIC_PASSWORD_RECOVERY_REDIRECT_TO`

Ejemplo:

- Web: `https://tu-dominio.com/set-password`
- Deep link app: `prestamosapp://set-password`

## 2) Comandos exactos de deploy

Reemplazá los valores entre `<>`.

### A. Linkear proyecto

```bash
npx supabase link --project-ref <PROJECT_REF>
```

### B. Cargar secrets

```bash
npx supabase secrets set SUPABASE_URL=<https://<PROJECT_REF>.supabase.co> SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
```

### C. Deployar funciones

```bash
npx supabase functions deploy registro-cliente-publico
npx supabase functions deploy resolver-identificador-login
```

## 3) Configuración extra necesaria

- `verify_jwt = false` para ambas funciones en `supabase/config.toml`, porque son flujos públicos de login/registro previos a sesión autenticada.
- CORS ya incluido en ambas funciones (`authorization, x-client-info, apikey, content-type`).
- Método esperado: `POST` (con respuesta `OPTIONS` para preflight).
- No requieren headers de auth de usuario logueado.

## 4) Checklist post-deploy (pruebas reales)

> Tablas esperadas: `auth.users`, `public.usuarios`, `public.clientes`.

### 1. Registro nuevo con correo + DNI nuevos
- Acción: crear cuenta en `/register` con email y DNI no usados.
- Esperado usuario: éxito y redirección/login disponible.
- Esperado datos:
  - nuevo registro en `auth.users`
  - nuevo registro en `public.usuarios` con `rol='cliente'`
  - nuevo/actualizado `public.clientes` con `usuario_id` vinculado

### 2. Login con correo
- Acción: `/login` con email + contraseña correctos.
- Esperado usuario: inicia sesión.
- Esperado datos: sin inserts/updates en tablas de identidad.

### 3. Login con DNI
- Acción: `/login` con DNI + contraseña correcta.
- Esperado usuario: inicia sesión (resuelve email internamente).
- Esperado datos: sin inserts/updates en tablas de identidad.

### 4. Recuperar contraseña
- Acción: `/recover-password` con correo válido existente.
- Esperado usuario: mensaje de envío exitoso.
- Esperado datos: sin cambios directos en `public.usuarios`/`public.clientes`.

### 5. Correo duplicado (registro)
- Acción: intentar registrar email ya existente.
- Esperado usuario: mensaje `Ese correo ya está registrado.`
- Esperado datos: no crear nuevo `auth.users`, no insertar `usuarios`, no modificar vínculo en `clientes`.

### 6. DNI duplicado (registro)
- Acción: intentar registrar DNI ya vinculado a otro usuario.
- Esperado usuario: mensaje `Ese DNI ya pertenece a un cliente.`
- Esperado datos: sin nuevas altas.

### 7. DNI inexistente (login)
- Acción: login con DNI no asociado.
- Esperado usuario: mensaje `No encontramos una cuenta asociada a ese DNI.`
- Esperado datos: sin cambios.

### 8. Contraseña incorrecta
- Acción: login con email o DNI válidos + contraseña inválida.
- Esperado usuario: mensaje `Usuario o contraseña incorrectos.`
- Esperado datos: sin cambios.

## 5) Confirmación de flujo técnico

### `registro-cliente-publico`
1. Crea usuario en `auth.users` (admin API).
2. Inserta registro en `public.usuarios`.
3. Crea o vincula registro en `public.clientes`.
4. Asigna `rol='cliente'` (metadata de auth y columna `usuarios.rol`).
5. Evita duplicados por email y por DNI ya vinculado.
6. Ejecuta rollback si falla a mitad de proceso:
   - borra `usuarios` insertado
   - desvincula `clientes.usuario_id`
   - elimina usuario de auth creado

### `resolver-identificador-login`
1. Recibe DNI o correo.
2. Si es correo, devuelve email normalizado.
3. Si es DNI, busca email vinculado en `usuarios` por `clientes.usuario_id`.
4. Si no existe, responde error claro.
5. No expone datos sensibles extra (solo `email` y `source` en éxito).
6. Respuesta consistente para frontend con `ok/error/code` en errores.
