# Pietro Embalagens - Calculadora de ROI

Este projeto é uma calculadora de precificação para marketplaces (Mercado Livre, Shopee, TikTok Shop, etc.) focada em garantir a margem de lucro real sobre o preço de venda.

## Regras de Negócio Persistentes

### 1. Mercado Livre
- **ML Clássico**: Comissão de 12%.
- **ML Premium**: Comissão de 17%.
- **Taxa Fixa**: R$ 6,00 para produtos com preço de venda < R$ 79,00.
- **Frete**: Para vendas >= R$ 79,00, a taxa fixa de R$ 6,00 é removida e aplica-se o custo de frete configurado no canal.

### 2. Shopee
- **Comissão Dinâmica**:
  - Venda < R$ 80,00: 20%
  - Venda >= R$ 80,00: 14%
- **Taxa Fixa Dinâmica**:
  - Venda até R$ 79,99: R$ 4,00
  - Venda de R$ 80,00 até R$ 99,00: R$ 16,00
  - Venda > R$ 99,00: R$ 16,00 (conforme última definição)

### 3. Cálculo de Preço (Markup Reverso)
O sistema utiliza a fórmula de Markup Reverso para garantir que a margem desejada seja calculada sobre o **Preço de Venda Final**:
`Preço = (Custo + Taxas Fixas) / (1 - (Comissões% + Impostos% + Margem%))`

### 4. Persistência de Dados
- Utiliza Firebase Firestore para salvar produtos na nuvem vinculados ao UID do usuário Google.
- Caminho no Firestore: `users/{uid}/products/{sku}`

## Instruções para o Agente
- Sempre validar se os campos numéricos são `NaN` ou `undefined` antes de renderizar ou salvar.
- Manter a identidade visual da Pietro Embalagens (Laranja e Azul).
- Ao adicionar novos canais, seguir o padrão de cálculo dinâmico implementado em `src/lib/calculator.ts`.
