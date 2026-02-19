## 1. Ferramentas de Automação

Criamos ferramentas para facilitar a geração do instalador:
- **`config_db.py`**: Utilitário para configurar o PostgreSQL.
- **`build_installer.ps1`**: Script que automatiza o build, gera o executável do configurador e organiza os arquivos.
- **`installer.iss`**: Script para o Inno Setup gerar o `.exe` de instalação final.

### Pré-requisito para o Desenvolvedor
Para gerar o executável do configurador, instale o PyInstaller no seu ambiente:
```powershell
pip install pyinstaller
```

## 2. Como Gerar o Instalador (.exe)

### Passo 1: Preparar os arquivos
No terminal (PowerShell), execute o script de build na raiz do projeto:
```powershell
.\build_installer.ps1
```
Este comando irá:
1. Compilar o Frontend (`npm run build`).
2. Gerar o executável do configurador de banco.
3. Criar a pasta `dist` organizada para o instalador.

### Passo 2: Gerar o Executável
1. Instale o [Inno Setup](https://jrsoftware.org/isdl.php).
2. Abra o arquivo `installer.iss`.
3. Clique em **Compile** (F9).
4. O instalador final estará em `installer_output/`.

## 3. Tipos de Instalação

O novo instalador oferece dois modos:

### A. Instalação Completa (Servidor)
*   **O que instala:** Backend (Python/FastAPI), Frontend e o Configurador de Banco.
*   **Quando usar:** No computador principal da empresa onde o banco de dados ficará.
*   **Pós-instalação:** O configurador de banco abrirá automaticamente para salvar a conexão com o PostgreSQL.

### B. Instalação Terminal (Estação)
*   **O que instala:** Apenas o Frontend.
*   **Quando usar:** Nos computadores dos outros funcionários que acessarão o servidor central.
*   **Configuração:** Ao abrir pela primeira vez, clique na engrenagem na tela de login e:
    1.  Informe o **IP do Servidor**.
    2.  Selecione **IA do Servidor** para economizar recursos da estação.

---
*Nota: Certifique-ce que o computador tem Python e Node.js no PATH do sistema para o inicializador funcionar.*
