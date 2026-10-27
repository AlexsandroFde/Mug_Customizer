# Caneca personalizada

Personalizador de canecas com visualização 3D em tempo real. O usuário escolhe uma imagem do próprio dispositivo, define a área da caneca que receberá a impressão (formato, dimensões e posição), ajusta o encaixe, a posição, o tamanho e a rotação da imagem dentro dessa área e confere tudo na caneca tridimensional antes de produzir. Também escolhe a cor da caneca inteira e, se quiser, cores próprias para a alça, a borda e o interior. O resultado pode ser baixado como uma imagem PNG.

Nada é enviado para a internet: a imagem é lida e processada localmente, no navegador.

## Como rodar

Requer Node.js 22.12 ou mais recente.

```bash
npm install
npm run dev       # servidor de desenvolvimento em http://localhost:5173
npm run build     # verificação de tipos + build de produção em dist/
npm run preview   # serve o build de produção
npm test          # testes unitários (Vitest)
npm run lint      # Oxlint
```

## Tecnologias

- React 19 + TypeScript, empacotado com Vite.
- three.js para a renderização 3D, integrado ao React com React Three Fiber.
- Drei para controles de câmera (`CameraControls`), ambiente de estúdio (`Environment` + `Lightformer`) e sombra de contato.

## Organização

```
src/
  config/
    mugSpec.ts                   Medidas da caneca e da alça, limites físicos de impressão e limites de arquivo
    mugColors.ts                 Cor-base e cores próprias das partes, cores padrão e paleta sugerida
  lib/
    printArea.ts                 Área de impressão: formatos, dimensões, escala, limites e alças do editor 2D
    printMapping.ts              Encaixe e posicionamento da imagem na área (a mesma matemática do shader)
    color.ts                     Validação de hexadecimal e conversões RGB/HSV
    imageFile.ts                 Validação: assinatura binária, tamanho e dimensões lidas do cabeçalho
    imageProcessing.ts           Decodificação, redução em etapas, miniatura e detecção de transparência
    format.ts                    Números no padrão brasileiro
  hooks/
    useMugCustomization.ts       Estado da personalização (imagem, ajustes, área, cores, status do envio)
    useFileDrop.ts               Arrastar e soltar arquivos em qualquer ponto da página
    useCoarsePointer.ts          Detecta dispositivos de toque para adaptar as dicas
  components/
    MugViewer/                   Cena 3D
      MugViewer.tsx              Canvas, sobreposições e teclado
      MugModel.tsx               Malhas da caneca, parâmetros da estampa e seleção de partes pelo ponteiro
      mugGeometry.ts             Geometria procedural (perfil de revolução, alça, oclusão do interior)
      mugMaterials.ts            Esmalte do corpo, materiais da alça, da borda e do interior e anel sem esmalte
      MugTexture.ts              Textura da estampa e material que a aplica na parede externa
      StudioLighting.tsx         Softboxes, luz principal com sombra e rig que acompanha a câmera
      CameraRig.tsx              Controles de câmera, limites, vistas pré-definidas e enquadramento
      PrintDragController.tsx    Arraste da estampa diretamente sobre a caneca
      SceneCapture.tsx           Exportação da vista atual em PNG, sem guias nem destaques
      ViewerOverlay.tsx          Vistas, botão de guias, modos, zoom, carregamento e perda de contexto WebGL
    CustomizationPanel/          Painel em abas (Estampa, Área, Cores), editor 2D e rodapé com as ações gerais
    ImageUploader/               Campo de arquivo, adicionar, substituir e remover a imagem, erros
    ui/                          Ícones, abas, grupos, controle segmentado, interruptor, seletor de cor, aviso
```

## Decisões técnicas

**A estampa é aplicada no shader, não numa malha à parte.** O material da parede externa (um `MeshPhysicalMaterial` estendido com `onBeforeCompile`) calcula, para cada fragmento, a posição dele na área de impressão "desenrolada" (comprimento de arco e altura, em cm) e amostra a imagem a partir daí. Por isso a estampa segue a curvatura, recebe a mesma luz e o mesmo verniz da cerâmica, nunca aparece na alça, no interior ou na base (essas regiões são malhas com outros materiais) e é recortada nos limites da área de impressão. Mover, girar ou redimensionar a estampa ou a área altera apenas uniforms: a geometria, a textura e o shader não são recriados.

**Aparência de impressão.** A tinta é aplicada como numa impressão sobre fundo branco: na caneca branca isso equivale à sublimação (o branco da imagem é o próprio branco do esmalte, então fundos brancos não formam um "retângulo"); numa caneca colorida, a imagem continua fiel e legível, e as partes transparentes de um PNG mostram a cor da cerâmica. Quando a caneca é colorida e a imagem não tem transparência, a aba Estampa avisa que o fundo branco também será impresso. A textura usa alfa pré-multiplicado (sem franjas escuras nas bordas transparentes), mipmaps e filtragem anisotrópica, e as bordas da estampa são antisserrilhadas a partir do tamanho do pixel na superfície, medido pela posição 3D (e não pela coordenada desenrolada, que dá um salto na costura atrás da alça). O editor 2D mostra a parede na cor da caneca.

**Realismo da caneca.** O perfil tem base com anel de apoio sem esmalte, calcanhar e borda arredondados e interior com concordância no fundo; a alça é uma varredura de seção de superelipse com a junção alargada como um filete de cerâmica. A oclusão ambiente do interior é calculada por amostragem de raios contra a cavidade (validada nos testes contra os fatores de forma analíticos), e reflexos do ambiente que a própria parede bloquearia são atenuados no shader do interior.

**Cores: cor-base e cores próprias.** O estado (`state.colors`) guarda a cor-base em `body` e, em `overrides`, a cor própria de cada parte (`handle`, `rim`, `interior`) ou `null` quando a parte acompanha a cor-base, que é o padrão. `resolveMugColors` calcula a cor efetiva de cada parte. Com isso:

- mudar a cor da caneca pinta o corpo e as partes vinculadas, e preserva as cores próprias já escolhidas;
- "Aplicar a todas as partes" volta a vincular as três (`overrides` vira `null`); "Restaurar branco" muda só a cor-base; o interruptor "Acompanhar a cor da caneca" vincula ou desvincula uma parte (ao desvincular, a parte guarda a cor atual e só muda quando o usuário escolher outra).

Corpo, alça, borda e interior são malhas separadas, cada uma com seu material; o anel de apoio, sem esmalte, nunca muda. A borda é exatamente o acabamento arredondado do topo, de uma tangente à outra, então a cor não invade a parede externa nem o interior. Trocar uma cor altera só `material.color` (sem recriar geometria, texturas ou shaders) e não toca na estampa, na área nem na câmera. A oclusão ambiente da borda e do interior é recalculada conforme a cor do interior, já que um interior escuro rebate menos luz. As cores são hexadecimais `#rrggbb`: dados simples, prontos para serem salvos caso a aplicação ganhe persistência.

**Área de impressão separada da imagem.** Há dois níveis, em cm, no mesmo referencial "desenrolado" (x ao longo da circunferência, a partir do lado oposto à alça):

- a *região imprimível* é o limite físico, derivado de `PRINT_LIMITS` em `mugSpec.ts` (margens da borda e da base e faixa livre ao redor da alça). São valores de referência coerentes com o modelo; ajuste-os conforme o fornecedor e o método de fabricação;
- a *área de impressão* (`state.area`) é a escolha do usuário: formato (retangular, quadrado ou personalizado), largura, altura e posição. Ela sempre fica dentro da região imprimível, que não atravessa a alça; por isso nunca dá a volta na caneca nem se sobrepõe a si mesma.

A imagem (`state.transform`) é posicionada a partir do centro da área, e o encaixe (Conter, Cobrir, Preencher ou Tamanho original, a 300 dpi) usa as dimensões da área. Mover a área leva a imagem junto; redimensioná-la reaplica o encaixe escolhido, e a imagem só é reposicionada se o centro dela ficar fora da área nova. Mudar a área não altera as cores nem a câmera. A "escala geral" é derivada das dimensões: 100% é a maior área com as proporções atuais. A máscara da área é uma função de distância com sinal (`areaSignedDistance` em TypeScript e `printAreaDistance` no shader): para um formato de máscara novo, basta acrescentar um caso nas duas.

**Guias de edição.** Limite físico hachurado, área tracejada em azul (em âmbar contínuo onde encosta no limite) e contorno da imagem em vinho, com as mesmas cores na caneca e no editor 2D. Elas aparecem sozinhas na aba Área e no modo "Mover estampa", e o botão "Guias", na cena, oculta tudo para ver o resultado final. As guias são desenhadas só na visualização, nunca na arte.

**Interface.** A cena 3D ocupa a maior parte da tela; o painel lateral (embaixo, em telas estreitas) tem três abas na ordem natural de uso, Estampa, Área e Cores, e um rodapé fixo com as ações gerais: "Redefinir" (estampa, área e cores voltam ao padrão, com "Desfazer" num aviso, e a imagem é mantida) e "Baixar imagem" (PNG da vista atual com fundo transparente, renderizado sem guias nem destaques). As abas só mudam o que é exibido; nenhuma configuração se perde ao alternar. Sem imagem, a aba Estampa oferece o envio e um atalho para começar pelas cores. Na aba Cores, passar o ponteiro sobre a caneca destaca a parte, e clicar a seleciona no painel; o destaque usa um tom azul em partes claras e um brilho claro em partes escuras. Os estilos usam tokens únicos (cores, espaçamento em múltiplos de 4, tipografia, raios e alturas de controle), com alvos de toque de pelo menos 44 px em telas sensíveis ao toque.

**Gestos sem conflito.** No modo "Girar", arrastar gira a câmera; na aba Cores, um toque ou clique sem arraste seleciona a parte da caneca. No modo "Mover estampa", um gesto que começa sobre a área de impressão é capturado antes de chegar aos controles de câmera e move a estampa; fora dela, a caneca continua girando. O editor 2D (que move a imagem, ou move e redimensiona a área pelas alças quando a aba Área está aberta), os sliders com campos numéricos e as setas do teclado oferecem alternativas precisas e acessíveis.

**Desempenho.** A cena só é renderizada quando algo muda (`frameloop="demand"`). Texturas e canvases de imagens substituídas ou removidas são liberados. Imagens grandes são reduzidas em etapas para no máximo 4096 px (2048 px em dispositivos de toque); a resolução original continua sendo usada no cálculo de qualidade de impressão.

## Limites de arquivo

Definidos em `src/config/mugSpec.ts` (`IMAGE_LIMITS`): PNG, JPEG ou WebP, até 20 MB, até 64 megapixels e com pelo menos 64 px em cada lado. As dimensões são verificadas no cabeçalho do arquivo antes da decodificação.

## Observações

- O console mostra o aviso `THREE.Clock: This module has been deprecated`. Ele vem do React Three Fiber 9.8, que ainda usa `THREE.Clock` internamente, e não afeta o funcionamento.
- O arraste sobre a caneca, a oclusão do interior e as guias assumem a caneca na origem da cena, sem rotação (como em `MugModel`).
