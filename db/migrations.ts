export const migrations = [
  {
    version: 0,
    migration: `
create table if not exists measurements (
    id serial primary key,
    type text not null,
    unit text not null,
    value real not null,
    created_at integer not null

);

create table if not exists conversation (
    id serial primary key,
    content text not null,
    created_at real not null
);

create table if not exists memories (
    id serial primary key,
    content text not null,
    created_at real not null,
    updated_at real
);

PRAGMA user_version = 1;
`,
  },
];
