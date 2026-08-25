# Detection-test - Fase 1

Esta fase deja la base usable de la plataforma para usuarios institucionales.

## Alcance implementado

- Dashboard profesional en `/dashboard`.
- Sesion de plataforma centralizada en `lib/auth/session.ts`.
- Matriz RBAC en `lib/domain/authorization.ts`.
- Menu lateral filtrado por permisos.
- Login y registro navegables hacia el panel principal.
- Esquema Prisma inicial para PostgreSQL en `prisma/schema.prisma`.
- Base de datos preparada para usuarios, roles, permisos, instituciones, estudiantes y auditoria.

## Principios

- La informacion psicopedagogica se trata como sensible.
- Los roles aplican minimo privilegio.
- El acceso a antecedentes familiares y de salud queda separado por permisos.
- El dashboard consume datos desde una capa separada, no desde componentes acoplados.
- Los instrumentos no se implementan como formularios rigidos en el frontend.

## Roles base

- `SUPER_ADMIN`
- `ADMIN_INSTITUCION`
- `PSICOPEDAGOGO`
- `DECE`
- `DOCENTE_APOYO`
- `DOCENTE`
- `CONSULTA`

## Proxima fase

La Fase 2 debe implementar estudiantes y expediente psicopedagogico persistente:

- Datos personales.
- Representantes.
- Historia familiar, desarrollo, salud, autonomia e historia escolar.
- Adjuntos protegidos.
- Eventos de auditoria por creacion, consulta y modificacion.
