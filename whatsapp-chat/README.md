# 💬 TicketFlow - Módulo de Chat WhatsApp Multiatendente

Este módulo implementa um sistema de atendimento ao cliente multiatendente para WhatsApp que roda de forma **100% offline e local** em sua rede. A arquitetura foi desenhada para conectar múltiplos computadores de atendentes a uma única instância do WhatsApp conectada no servidor.

---

## 🛠️ Tecnologias Utilizadas

- **Servidor:** Node.js + Express
- **Protocolo de Comunicação:** WebSockets via Socket.io
- **Banco de Dados Local:** SQLite3 (Persistência rápida de dados em arquivo local)
- **Integração WhatsApp:** `whatsapp-web.js` (Biblioteca que automatiza o WhatsApp Web localmente usando um navegador headless)
- **Interface Visual:** HTML5, CSS customizado (Glassmorphism e tema OLED Dark) + Tailwind CSS

---

## 📂 Estrutura de Arquivos

```text
/whatsapp-chat
  ├── /public
  │     ├── index.html   --> Painel do atendente (HTML)
  │     ├── style.css    --> Folha de estilos premium
  │     └── app.js       --> Lógica Javascript do cliente WebSocket
  ├── server.js          --> Servidor Node.js + Socket.io + SQLite + WhatsApp
  ├── package.json       --> Dependências do módulo
  └── README.md          --> Este guia de instalação
```

---

## 🚀 Como Executar

### 1. Instalar Dependências
Acesse a pasta `whatsapp-chat` e instale os pacotes necessários:

```bash
cd whatsapp-chat
npm install
```

> [!NOTE]
> O processo de instalação irá baixar o Puppeteer/Chromium localmente na pasta `.cache`. Isso é necessário para rodar a ponte do WhatsApp Web em segundo plano.

### 2. Iniciar o Servidor
Execute o comando abaixo para iniciar o painel e o serviço de escuta:

```bash
npm start
```

Ou, caso queira rodar em modo de desenvolvimento (com auto-reload ao editar arquivos):

```bash
npm run dev
```

O painel estará disponível localmente em: `http://localhost:5000`

---

## 🔄 Funcionamento do Fluxo

1. **Autenticação:** Ao abrir a interface no navegador pela primeira vez, caso o servidor não esteja conectado ao WhatsApp, um **QR Code** será exibido no centro da tela. Escaneie-o usando a função "Aparelhos Conectados" no aplicativo do celular.
2. **Identificação do Atendente:** O painel solicitará um Nome e um ID único para o atendente (ex: `pc_joao`). Esses dados são gravados localmente no navegador e usados para rastrear quem enviou cada mensagem.
3. **Fila de Espera:** Quando um cliente envia uma mensagem para o número conectado, se ele não possuir atendimento ativo, ele entra na **Fila de Espera**. Qualquer atendente conectado na rede verá o cliente e poderá clicar em **"Atender"**.
4. **Atendimento:** Ao assumir a conversa, o histórico completo desse cliente é carregado na tela e novas mensagens são trocadas via WebSockets com confirmação direta.
5. **Sessão Persistente:** A autenticação é armazenada na pasta local `.wwebjs_auth`. Portanto, após escanear a primeira vez, o servidor se conectará automaticamente nas próximas reinicializações.
