-- Tabla para almacenar conexiones de Telegram de usuarios anónimos y autenticados
CREATE TABLE IF NOT EXISTS telegram_connections (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  telegram_chat_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsquedas rápidas por user_id
CREATE INDEX IF NOT EXISTS idx_telegram_connections_user_id ON telegram_connections(user_id);

-- RLS: permitir a todos leer sus propias conexiones
ALTER TABLE telegram_connections ENABLE ROW LEVEL SECURITY;

-- Permitir INSERT y UPDATE a todos (necesario para el webhook)
CREATE POLICY "Allow public insert" ON telegram_connections
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update" ON telegram_connections
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow public select" ON telegram_connections
  FOR SELECT
  USING (true);
