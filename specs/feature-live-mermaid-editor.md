# Feature: Live Mermaid Editor

## Feature Description
Editor Mermaid interativo com sincronização bidirecional em tempo real entre arquivo local e interface web, com capacidade de selecionar nodes e enviar requests ao Web Bridge.

## User Story
Como desenvolvedor trabalhando com fluxogramas Mermaid, quero um editor que sincronize automaticamente as mudanças do arquivo local e permita selecionar nodes para enviar inputs ao Web Bridge, para que eu possa interagir com meus diagramas de forma fluida.

## Problem Statement
Editores Mermaid atuais não sincronizam em tempo real com arquivos locais e não permitem interação direta com nodes específicos do diagrama.

## Solution Statement
Interface web minimalista com:
- Editor de texto Mermaid com sync bidirecional (file watcher + auto-save)
- Preview do diagrama usando mermaid.js
- Seleção de nodes com clique direito → popup de input
- Envio de requests ao Web Bridge (localhost:3737) com `{selectedNode, userInput, filePath}`

## Relevant Files

### New Files
- `examples/mermaid-editor.html` (editor standalone)
- `specs/feature-live-mermaid-editor.md` (este arquivo)

### Modified Files
- `extensions/web-bridge.ts` (opcional: adicionar endpoint específico para mermaid)

## Implementation Plan

### Foundation Phase
1. Criar HTML base com layout split (editor | preview)
2. Importar mermaid.js via CDN
3. Configurar File System Access API ou `<input type="file">` para abrir arquivo local
4. Estabelecer conexão com Web Bridge (localhost:3737)

### Core Phase
1. **File Watcher**:
   - Ler arquivo inicial
   - Poll ou File System Access API para detectar mudanças externas
   - Atualizar editor quando arquivo mudar

2. **Auto-Save**:
   - Debounce de 500ms após digitação
   - Escrever de volta ao arquivo
   - Atualizar preview Mermaid

3. **Node Selection**:
   - Interceptar clique direito no SVG renderizado
   - Identificar node clicado via SVG element traversal
   - Mostrar popup na posição do mouse

### Integration Phase
1. **Popup Input**:
   - Form minimal com textarea + botão Send
   - Capturar nodeId, nodeText, e input do usuário

2. **Web Bridge Request**:
   - POST para `/pi/message` com payload:
     ```json
     {
       "source": "mermaid-editor",
       "payload": {
         "nodeId": "node1",
         "nodeText": "Start",
         "userInput": "...",
         "mermaidCode": "..."
       },
       "meta": {
         "file_path": "/path/to/flowchart.mmd"
       }
     }
     ```

3. **Poll Response**:
   - Usar endpoint `/poll/:id` existente
   - Mostrar resposta inline ou em modal

## Step by Step Tasks

1. **Estrutura HTML** (`examples/mermaid-editor.html`)
   - Split pane: textarea (esq) + div preview (dir)
   - Toolbar: Open File, Reload, Path display
   - Popup hidden (position: absolute, z-index)

2. **File Handling**
   - Botão "Open" → file picker
   - Armazenar file handle para re-escrita
   - Se File System Access API não suportado: fallback para read-only mode

3. **Mermaid Integration**
   - `mermaid.initialize({ startOnLoad: false })`
   - `mermaid.render()` em debounce do textarea input
   - Error handling para syntax invalid

4. **SVG Node Detection**
   - Event listener `contextmenu` no SVG
   - `event.target.closest('.node')` ou classes Mermaid
   - Extrair id/text do elemento

5. **Popup Logic**
   - Mostrar em `event.clientX/Y`
   - Fechar em click-outside ou ESC
   - Enviar ao Web Bridge no submit

6. **Web Bridge Client**
   - Reutilizar lógica de `web-bridge-test.html`
   - Adicionar tratamento específico para mermaid

## Testing Strategy

### Unit Tests
(Não aplicável - interface web)

### Integration Tests
- Abrir arquivo .mmd local → conteúdo carrega no editor
- Modificar arquivo externamente → editor atualiza
- Modificar editor → arquivo salva
- Clique direito em node → popup aparece
- Enviar input → request chega no Web Bridge

### Edge Cases
- Arquivo não existe (deletado externamente)
- Syntax Mermaid inválida → preview mostra erro
- Node sem ID/texto
- Web Bridge offline → mostrar erro visual
- Caminhos com caracteres especiais

## Acceptance Criteria
- [ ] Abre arquivo Mermaid local
- [ ] Preview renderiza diagrama
- [ ] Mudanças no arquivo atualizam editor
- [ ] Mudanças no editor salvam no arquivo
- [ ] Clique direito em node mostra popup
- [ ] Popup envia request para Web Bridge
- [ ] Request inclui nodeId, userInput, filePath
- [ ] Response do Pi é exibida

## Validation Commands
```bash
# Iniciar Pi com Web Bridge
pi -e extensions/web-bridge.ts

# Abrir editor no browser
start examples/mermaid-editor.html

# Criar arquivo de teste
cat > test-flow.mmd << 'EOF'
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
EOF

# Testar fluxo manual:
# 1. Abrir test-flow.mmd no editor
# 2. Modificar no editor → verificar salvamento
# 3. Modificar externamente → verificar atualização
# 4. Clique direito em um node → popup aparece
# 5. Enviar input → verificar no Pi
```

## Notes

### Technologies
- **mermaid.js** via CDN (`https://cdn.jsdelivr.net/npm/mermaid@11`)
- **File System Access API** (`window.showOpenFilePicker()`)
- Fallback para `<input type="file">` se não suportado

### Web Bridge Payload
```typescript
interface MermaidNodeRequest {
  source: "mermaid-editor";
  payload: {
    nodeId: string;
    nodeText: string;
    userInput: string;
    mermaidCode: string;
  };
  meta: {
    file_path: string;
  };
}
```

### Minimal UI
- Sem frameworks
- CSS inline (~150 linhas)
- Vanilla JS (~200 linhas)
- Foco: funcional sobre bonito

### Dependencies
- Zero dependências de build
- Apenas mermaid.js CDN
- Requer Web Bridge rodando em localhost:3737
