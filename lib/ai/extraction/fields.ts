// One field the model may extract beyond the core set. `description` is what
// the model reads (English, so one prompt serves every UI language); the label
// people see is in the message catalogs.
export type FieldDefinition = { key: string; description: string };
