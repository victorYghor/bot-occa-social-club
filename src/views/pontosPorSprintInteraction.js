// Importa a função getRankingWithSprints do controlador e sendLongMessage do serviço de mensagens
const { getRankingWithSprints } = require('../controllers/ControllerRanking');
const { sendLongMessage } = require('../services/ServiceMensagens');

// Função assíncrona para lidar com a interação de pontos por sprint
async function handlePontosPorSprintInteraction(interaction) {
    // Responde ao usuário que o processamento está em andamento
    await interaction.deferReply();
    try {
        // Obtém o ranking com sprints
        const rankingComSprints = await getRankingWithSprints();

        // Verifica se o ranking tem dados
        if (rankingComSprints.length > 0) {
            // Inicializa a mensagem de resposta
            let pontosPorSprintMessage = '\n**Pontos de Eva por assinante:**\n\n';

            // Itera sobre os usuários no ranking
            for (const usuario of rankingComSprints) {
                // Adiciona os pontos totais de EVA e XP do usuário à mensagem
                pontosPorSprintMessage += `${usuario.nome} ganhou ${usuario.totalPontosEVA} pontos EVA e ${usuario.totalPontosXP.toFixed(2)} pontos XP\n`;

                // Itera sobre as sprints do usuário
                Object.keys(usuario.pontosPorSprint).forEach(sprint => {
                    const pontosEVA = usuario.pontosPorSprint[sprint].pontosEVA;
                    const pontosXP = usuario.pontosPorSprint[sprint].pontosXP;
                    pontosPorSprintMessage += `Sprint ${sprint}: ${pontosEVA} pontos EVA, ${pontosXP.toFixed(2)} pontos XP\n`;
                });

                // Adiciona um separador
                pontosPorSprintMessage += '---\n';

                // Se a mensagem exceder 1900 caracteres, envia a mensagem e reinicia
                if (pontosPorSprintMessage.length > 1900) {
                    await sendLongMessage(interaction, pontosPorSprintMessage.trim());
                    pontosPorSprintMessage = ''; 
                }
            }

            // Envia qualquer mensagem restante
            if (pontosPorSprintMessage.trim() !== '') {
                await sendLongMessage(interaction, pontosPorSprintMessage.trim());
            }
        } else {
            // Se não houver usuários no ranking, informa o usuário
            await interaction.followUp('Nenhum usuário encontrado para exibir os pontos por sprint.');
        }
    } catch (error) {
        // Em caso de erro, registra o erro no console e informa o usuário
        console.error('Erro ao exibir pontos por sprint:', error);
        await interaction.followUp('Ocorreu um erro ao tentar exibir os pontos por sprint.');
    }
}

// Exporta a função handlePontosPorSprintInteraction para uso em outros módulos
module.exports = { handlePontosPorSprintInteraction };
