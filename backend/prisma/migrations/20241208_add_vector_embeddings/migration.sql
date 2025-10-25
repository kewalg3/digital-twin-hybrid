-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table for storing chunked content with embeddings
CREATE TABLE user_context_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraint to users table
ALTER TABLE user_context_chunks
  ADD CONSTRAINT fk_user_context_chunks_user
  FOREIGN KEY (user_id) REFERENCES "users"(id)
  ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX idx_user_context_chunks_user_id ON user_context_chunks(user_id);
CREATE INDEX idx_user_context_chunks_source_type ON user_context_chunks(source_type);
CREATE INDEX idx_user_context_chunks_embedding ON user_context_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Function for vector similarity search
CREATE OR REPLACE FUNCTION match_user_chunks(
  query_embedding vector(1536),
  match_user_id TEXT,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  chunk_text TEXT,
  source_type TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    user_context_chunks.id,
    user_context_chunks.chunk_text,
    user_context_chunks.source_type,
    user_context_chunks.metadata,
    1 - (user_context_chunks.embedding <=> query_embedding) AS similarity
  FROM user_context_chunks
  WHERE user_context_chunks.user_id = match_user_id
    AND 1 - (user_context_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY user_context_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;