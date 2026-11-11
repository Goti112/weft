create table docs (
    id text primary key,
    next_seq bigint not null default 1,
    bytes bigint not null default 0,
    created_at timestamptz not null default now(),
    last_active timestamptz not null default now()
);

create table ops (
    doc_id text not null references docs(id) on delete cascade,
    seq bigint not null,
    replica_id text not null,
    counter bigint not null,
    payload jsonb not null,
    created_at timestamptz not null default now(),
    primary key (doc_id, seq),
    unique (doc_id, replica_id, counter)
);

create index docs_last_active_idx on docs(last_active);
