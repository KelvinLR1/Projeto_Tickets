import os
import logging

# Tenta importar o ChromaDB para suporte a RAG (Retrieval-Augmented Generation)
try:
    import chromadb
    from chromadb.utils import embedding_functions
    CHROMA_AVAILABLE = True
except Exception as e:
    logging.error(f"Não foi possível importar chromadb: {e}")
    CHROMA_AVAILABLE = False

# Configuração do caminho de persistência dos dados do ChromaDB
CHROMA_DATA_PATH = "./chroma_db"

client = None
collection = None

def get_collection():
    """
    Inicializa o cliente ChromaDB e retorna a coleção de documentos.
    Cria a coleção se ela não existir.
    """
    global client, collection
    if not CHROMA_AVAILABLE:
        return None
    if collection is not None:
        return collection
    
    try:
        print("Iniciando ChromaDB (isso pode levar alguns segundos na primeira vez)...")
        # Inicializa o cliente persistente (salva no disco)
        client = chromadb.PersistentClient(path=CHROMA_DATA_PATH)
        # Usa a função de embedding padrão (sentencetransformers)
        embedding_func = embedding_functions.DefaultEmbeddingFunction()
        # Obtém ou cria a coleção "knowledge_base"
        collection = client.get_or_create_collection(
            name="knowledge_base",
            embedding_function=embedding_func
        )
        print("ChromaDB carregado com sucesso.")
        return collection
    except Exception as e:
        logging.error(f"Erro ao inicializar ChromaDB: {e}")
        print(f"AVISO: ChromaDB (RAG) não está disponível. {e}")
        return None

def add_document(doc_id: str, text: str, meta: dict = None):
    """
    Adiciona ou atualiza um documento de texto na base de conhecimento vetorial.
    """
    coll = get_collection()
    if coll is None:
        return False
    try:
        coll.add(
            documents=[text],
            metadatas=[meta] if meta else None,
            ids=[str(doc_id)]
        )
        return True
    except Exception as e:
        logging.error(f"Erro ao adicionar documento ao ChromaDB: {e}")
        return False

def query_documents(query_text: str, n_results: int = 3):
    """
    Busca documentos semanticamente similares à consulta fornecida.
    Retorna os documentos mais relevantes (Top-N).
    """
    coll = get_collection()
    if coll is None:
        return {"results": [], "error": "ChromaDB não disponível"}
    try:
        results = coll.query(
            query_texts=[query_text],
            n_results=n_results
        )
        
        # OTIMIZAÇÃO: Trunca documentos muito longos para economizar tokens e acelerar processamento
        if results.get("documents"):
            for i, doc_list in enumerate(results["documents"]):
                results["documents"][i] = [str(doc)[:800] + "..." if len(str(doc)) > 800 else str(doc) for doc in doc_list]
        
        return results
    except Exception as e:
        logging.error(f"Erro ao buscar no ChromaDB: {e}")
        return {"results": [], "error": str(e)}

def clear_knowledge_base():
    """
    Remove todos os documentos da base de conhecimento vetorial.
    """
    coll = get_collection()
    if coll is None:
        return False
    try:
        # Busca todos os IDs existentes para deletar
        all_ids = coll.get()["ids"]
        if all_ids:
            coll.delete(ids=all_ids)
        return True
    except Exception as e:
        logging.error(f"Erro ao limpar ChromaDB: {e}")
        return False
