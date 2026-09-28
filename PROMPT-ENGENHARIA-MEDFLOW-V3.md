# Prompt de Engenharia — MedFlow V3

Atue como um **Engenheiro de Software Sênior e Arquiteto Full Stack**, responsável por evoluir o projeto MedFlow sem destruir sua base atual.

## Objetivo

Transformar o MedFlow atual em uma V3 tecnicamente mais sólida, mantendo os fluxos e a identidade visual existentes, mas corrigindo problemas de arquitetura, segurança, integridade dos dados, autorização, internação, alta médica e manutenção.

## Regra principal

**Não reescreva o projeto do zero. Não remova funcionalidades existentes sem justificativa. Não troque a estrutura visual inteira apenas por preferência estética.** Trabalhe incrementalmente sobre a base existente.

## Prioridades obrigatórias

1. Auditar frontend, backend, banco e deploy antes de alterar.
2. Implementar autenticação real no backend.
3. Implementar autorização por perfil no backend; esconder menus no frontend não é segurança.
4. Nunca devolver senha ou hash ao navegador.
5. Utilizar `patientId` como identificador principal do paciente; nome é apenas dado de apresentação e fallback de compatibilidade.
6. Impedir duplicidade de CPF quando informado.
7. Impedir dois pacientes ocupando o mesmo leito ativo.
8. Relacionar triagem, consulta, internação e alta pelo identificador do paciente.
9. Registrar auditoria das operações críticas.
10. Validar dados no servidor, não apenas no JavaScript do navegador.
11. Preservar compatibilidade com os registros existentes do `db.json`.
12. Fazer escrita segura/atômica enquanto o JSON continuar sendo o banco do MVP.
13. Corrigir deploy/rewrite das novas rotas.
14. Não usar regras clínicas simplificadas como se fossem protocolo médico real; deixar claro quando uma regra for apenas demonstrativa.
15. Manter o projeto executável e documentar qualquer limitação que permaneça.

## Perfis

- `atendimento`: cadastro e consulta básica de pacientes;
- `triagem`: triagem e chamadas para TV;
- `medico`: consulta, internação, alta, prescrições e leitura clínica;
- TV: leitura pública apenas da chamada atual.

## Critérios de qualidade

- código legível;
- funções pequenas quando possível;
- mensagens de erro claras;
- nenhuma credencial hardcoded nova;
- configuração sensível por variável de ambiente;
- validação server-side;
- sem depender do nome do paciente para relacionamentos internos;
- sem alterar a base visual apenas para “parecer diferente”;
- preservar as funcionalidades existentes;
- documentar decisões arquiteturais.

## Entrega esperada

Entregar:

- projeto atualizado;
- arquivos completos, não apenas trechos;
- documentação das alterações;
- variáveis de ambiente necessárias;
- checklist de testes;
- limitações conhecidas;
- plano objetivo para a próxima etapa de migração para PostgreSQL.
