import os
import logging

try:
    import chromadb
    from chromadb.utils import embedding_functions
    CHROMA_AVAILABLE = True
except Exception as e:
    logging.error(f"Não foi possível importar chromadb: {e}")
    CHROMA_AVAILABLE = False

# Configuração do ChromaDB
CHROMA_DATA_PATH = "./chroma_db"

client = None
collection = None

def get_collection():
    global client, collection
    if not CHROMA_AVAILABLE:
        return None
    if collection is not None:
        return collection
    
    try:
        print("Iniciando ChromaDB (isso pode levar alguns segundos na primeira vez)...")
        client = chromadb.PersistentClient(path=CHROMA_DATA_PATH)
        embedding_func = embedding_functions.DefaultEmbeddingFunction()
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
    coll = get_collection()
    if coll is None:
        return {"results": [], "error": "ChromaDB not available"}
    try:
        results = coll.query(
            query_texts=[query_text],
            n_results=n_results
        )
        
        # OTIMIZAÇÃO: Trunca documentos longos para acelerar processamento
        if results.get("documents"):
            for i, doc_list in enumerate(results["documents"]):
                results["documents"][i] = [doc[:800] + "..." if len(doc) > 800 else doc for doc in doc_list]
        
        return results
    except Exception as e:
        logging.error(f"Erro ao buscar no ChromaDB: {e}")
        return {"results": [], "error": str(e)}
