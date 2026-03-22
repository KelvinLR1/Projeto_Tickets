from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import os

# Configurações de segurança e JWT
# SECRET_KEY: Chave para assinar os tokens. Em produção, deve ser uma string aleatória longa e secreta.
SECRET_KEY = os.getenv("SECRET_KEY", "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7")
ALGORITHM = "HS256"
# Tempo de expiração do token de acesso (padrão: 8 horas)
ACCESS_TOKEN_EXPIRE_MINUTES = 480 

# Contexto para hashing de senhas usando o algoritmo bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Esquema OAuth2 para extração do token do cabeçalho de autorização
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password, hashed_password):
    """Verifica se uma senha em texto puro corresponde ao hash armazenado."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    """Gera um hash seguro a partir de uma senha em texto puro."""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Cria um novo token JWT com dados codificados e tempo de expiração."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        # Usa a expiração padrão definida nas configurações (8 horas)
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
            
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Dependências locais para injetar no FastAPI (Tenta várias formas de importação para suportar diferentes ambientes)
try:
    # Caso o script seja executado como um módulo de um pacote (ex: python -m server.main)
    from . import models, crud, database
except (ImportError, ValueError):
    try:
        # Caso o servidor seja executado a partir do root do projeto
        from server import models, crud, database
    except ImportError:
        # Caso o servidor seja executado de dentro da pasta server
        import models, crud, database

def get_current_user(db: Session = Depends(database.get_db), token: str = Depends(oauth2_scheme)):
    """
    Dependency que valida o token JWT e retorna o usuário atual autenticado.
    Lança erro 401 se o token for inválido ou o usuário não existir.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Decodifica o token usando a chave secreta e o algoritmo definido
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            print(f"[AUTH ERROR] Token payload sem 'sub': {payload}")
            raise credentials_exception
    except JWTError as e:
        print(f"[AUTH ERROR] Falha na decodificação do JWT: {str(e)}")
        raise credentials_exception
    
    # Busca o usuário no banco de dados
    user = crud.get_user_by_username(db, username=username)
    if user is None:
        print(f"[AUTH ERROR] Usuário não encontrado para: {username}")
        raise credentials_exception
    if not user.is_active:
        print(f"[AUTH ERROR] Usuário inativo: {username}")
        raise HTTPException(status_code=400, detail="Usuário inativo")
    return user

def get_current_active_admin(current_user: models.User = Depends(get_current_user)):
    """Garante que o usuário autenticado tenha privilégios de Administrador ou Root."""
    if current_user.role not in ["ADMIN", "ROOT"]:
        raise HTTPException(status_code=403, detail="O usuário não possui privilégios suficientes")
    return current_user

def get_current_active_root(current_user: models.User = Depends(get_current_user)):
    """Garante que o usuário autenticado tenha privilégios de Root (Superusuário)."""
    if current_user.role != "ROOT":
        raise HTTPException(status_code=403, detail="O usuário não possui privilégios suficientes")
    return current_user
