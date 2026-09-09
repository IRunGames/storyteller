### Setting up a Database For Database Driven Status Workflows

All of what you need is in `routines/_tables_metatable`.

1. Create the required tables
   - [`create_tables_table.sql`](routines/_tables_metatable/create_tables_table.sql)
   - [`create_global_settings_table.sql`](routines/_tables_metatable/create_global_settings_table.sql)
   - [`create_s_status_workflows_table.sql`](routines/_tables_metatable/create_s_status_workflows_table.sql)
   - [`create_s_statuses_table.sql`](routines/_tables_metatable/create_s_statuses_table.sql)

2. Create the required routines
   - [`_update_tables.sql`](routines/_tables_metatable/_update_tables.sql)
   - [`_update_workflow_constraints.sql`](routines/_tables_metatable/_update_workflow_constraints.sql)
   - [`_update_workflow_columns.sql`](routines/_tables_metatable/_update_workflow_columns.sql)
   - [`_update_workflow_status_timestamp_triggers.sql`](routines/_tables_metatable/_update_workflow_status_timestamp_triggers.sql)
   - [`_attach_workflow_triggers.sql`](routines/_tables_metatable/_attach_workflow_triggers.sql)

3. Done! See the [Database Driven Status Workflows](https://www.figma.com/board/nA4Llj9n13U7iI1C5rRQzY/-Docs--Database-Driven-Status-Workflows?node-id=0-1&p=f&t=mMUjmB9rPcul0Br5-0) doc for more details on adding a workflow to a specific table.
