# cancioneiro

Transforma cifras em texto (acordes em cima da letra, como nos sites de cifra) em
folhas A4 prontas para imprimir e montar uma pasta de músicas.

- Cada acorde fica exatamente sobre a sílaba em que ele entra, mesmo no meio da palavra.
- Diagramas de todos os acordes da música no topo da folha, com os dedos numerados.
- A música é ajustada para caber em uma folha sempre que possível (uma ou duas
  colunas, fonte entre 15pt e 11pt). Se não couber, continua na folha seguinte,
  com cabeçalho reduzido e numeração de páginas.
- Fonte Atkinson Hyperlegible, feita para leitura a distância, e visual preto e branco.

## Instalação

Precisa de Node 24+ e do Google Chrome instalado.

```sh
npm install
```

Para usar outro Chromium, defina `CHROME_PATH=/caminho/do/navegador`.

## Uso

Copie a cifra do site (acordes + letra) e rode:

```sh
npm run nova -- "Nome da Música" "Artista"
```

O texto é lido da área de transferência (ou da entrada padrão, se vier por pipe).
A música vira `musicas/NN-nome-da-musica.txt`, com numeração sequencial, e o PDF
sai em `saida/`.

Depois de editar algum arquivo:

```sh
npm run pdf                          # todas as músicas de musicas/
npm run pdf -- musicas/03-algo.txt   # só uma
```

## Formato do arquivo

```text
---
titulo: Amazing Grace
artista: John Newton
tom: G
capo: 2
batida: ↓ ↓↑ ↑↓↑
obs: Toque devagar
acorde: D5(9) = x57755
---

[Intro] G  C  G  D

[Primeira Parte]
 G      G7         C         G
Amazing grace, how sweet the sound
```

- O cabeçalho é opcional; sem título, o nome do arquivo é usado.
- `[Seção]` abre um bloco com rótulo. Blocos com "Refrão" ganham uma barra lateral.
- Uma linha só de acordes seguida de letra é combinada com ela pela coluna de cada acorde.
- Linhas de tablatura (`e|--0--|`) são mantidas em fonte monoespaçada.
- Uma linha `Tom: X` no começo do texto colado vira o tom da música.

## Formas dos acordes

Os acordes comuns usam as formas abertas de sempre, e os demais usam pestana na
posição mais baixa. Os raros vêm do banco
[chords-db](https://github.com/tombatossals/chords-db). Notação brasileira é
aceita: `7M`, `4`, `(9)`, `º`, `m7(5-)`, `5(9)`, baixos invertidos como `D/F#` etc.

Para trocar uma forma:

- só numa música: `acorde: NOME = casas` no cabeçalho;
- em todas: uma linha em `acordes.txt`.

As casas vão da 6ª corda (Mi grave) à 1ª, com `x` para corda não tocada. Os dedos
podem vir depois de `|`: `x 5 7 7 5 5 | 0 1 3 4 1 1`.

## Desenvolvimento

```sh
npm test        # testes
npm run check   # verificação de tipos
```

## Licença

MIT
