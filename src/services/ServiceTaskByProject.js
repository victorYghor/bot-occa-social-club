// Importações de módulos e configuração inicial
const axios = require('axios'); // Para requisições HTTP
const Parse = require('parse/node'); // Para interação com o Parse Server
const { getStoredTasksByProjects, getStoredSprints, fetchStoredUsers } = require('../repository/projetotRepository'); // Funções de acesso aos dados armazenados
const { convertAssignerIdsToNames, getAssignerNames, convertAssignerNameToId } = require('../services/ServiceNameID'); // Funções de conversão de IDs para nomes e vice-versa
const { sprintNameMap, statusMap } = require('../services/ServiceSprint'); // Mapeamentos de nomes de sprint e status
const { consoleOccinho } = require('../util/ConsoleOccinho');
const { User } = require('../models/User')
require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env

const logPath = "ServiceTaskByProject";

/**
 * Função assíncrona para adicionar ou atualizar projetos no Back4App
 * @returns log de alteração realizada
 */
async function addOrUpdateTaskByProjectsToBack4App(authTokenEva) {
    /**
     * Array que registra atualizações de nome dos usuários, dos status de uma tarefa ou dos assinantes da tarefa
     * @type {*[string]}
     */
    let changesLog = []; // Array para registrar alterações realizadas

    try {
        // Obtenção de sprints e projetos armazenados e usuários do Parse
        const [storedSprints, tasksByProjects, storedUsers] = await Promise.all([
            getStoredSprints(),
            getStoredTasksByProjects(),
            User.findAll()
        ]);

        consoleOccinho?.log(logPath, `token de eva é ${authTokenEva}`);
        // Requisição para obter os marcos (milestones) da API externa
        const milestonesResponse = await axios.get('https://apiproduction.evastrategy.com/api/v1/milestones', {
            headers: { 'Authorization': `Bearer ${authTokenEva}` } // Token de autorização da API
        });

        const milestones = milestonesResponse.data; // Array de marcos recebidos da API

        // Expressão regular para verificar se o título contém "[N: <número> X <número>] " com possíveis variações de espaços
        const regexNPrefix = /^\[\s*N\s*:\s*\d+\s*[Xx]\s*\d+\s*]\s?.*$/;
        // Expressão regular para capturar a parte relevante da descrição
        const regexDescriptionModel = /\[N\s*=\s*\d+\s*:\s*[^,\]]+(?:,\s*N\s*=\s*\d+\s*:\s*[^,\]]+)*\]/;

        // Iteração sobre cada marco recebido da API
        for (const milestone of milestones) {
            const sprintName = sprintNameMap[milestone.slug] || milestone.name; // Nome da sprint mapeado ou nome padrão do marco

            const tasksResponse = await axios.get(`https://apiproduction.evastrategy.com/api/v1/tasks?milestone=${milestone.id}`, {
                headers: { 'Authorization': `Bearer ${authTokenEva}` } // Token de autorização da API
            });

            const tasks = tasksResponse.data; // Array de projetos recebidos da API

            if (!Array.isArray(tasks)) {
                throw new Error('A resposta da API não é um array'); // Lança um erro se a resposta não for um array
            }

            const tasksBatch = []; // Array para registrar promessas de salvamento de projetos

            // Iteração sobre cada projeto recebido da API
            for (const task of tasks) {
                if (task.subject === 'teste' || task.subject === 'Estudar o codigo (front end) - NOME MEMBRO [8x1][Individual]') {
                    console.log(`Projeto ${task.subject} ignorado.`); // Ignora projetos de teste com o assunto 'teste'
                    continue;
                }

                // Requisição adicional para obter a descrição da tarefa
                const taskDetailResponse = await axios.get(`https://apiproduction.evastrategy.com/api/v1/tasks/${task.id}`, {
                    headers: { 'Authorization': `Bearer ${authTokenEva}` } // Token de autorização da API
                });

                const taskDetail = taskDetailResponse.data; // Detalhes da tarefa, incluindo a descrição
                const fullDescription = taskDetail.description; // Obtém a descrição completa da tarefa

                // Extrair a parte relevante da descrição
                const descriptionMatch = fullDescription.match(regexDescriptionModel);
                const description = descriptionMatch ? descriptionMatch[0] : 'essa tarefa não tem modelo de negociação'; // Se não houver correspondência, define mensagem padrão

                // Obtém nomes dos assinantes e IDs dos assinantes
                const assignersNames = getAssignerNames(task.assigners, storedUsers);
                const assignersIds = convertAssignerNameToId(assignersNames.split(', '), storedUsers);
                const existingTaskByProject = tasksByProjects.find(taskInDataBase => taskInDataBase.titulo === task.subject);

                if (existingTaskByProject) {
                    let changed = false; // Flag para indicar se houve alterações
                    let changeDetails = `Projeto ${task.subject} atualizado:`; // Detalhes das alterações realizadas

                    // Verifica e atualiza o status do projeto se necessário
                    if (existingTaskByProject.status !== statusMap[task.status]) {
                        changeDetails += `\n  - Status: de "${existingTaskByProject.status}" para "${statusMap[task.status]}"`;
                        existingTaskByProject.status = statusMap[task.status];
                        changed = true;
                    }

                    // Verifica e atualiza a sprint do projeto se necessário
                    if (existingTaskByProject.sprint !== sprintName) {
                        changeDetails += `\n  - Sprint: de "${existingTaskByProject.sprint}" para "${sprintName}"`;
                        existingTaskByProject.sprint = sprintName;
                        changed = true;
                    }

                    // Verifica e atualiza os assinantes do projeto se necessário
                    if (existingTaskByProject.assinantes !== assignersIds) {
                        const oldAssignerNames = convertAssignerIdsToNames(existingTaskByProject.assinantes, storedUsers);
                        const newAssignerNames = convertAssignerIdsToNames(assignersIds, storedUsers);

                        changeDetails += `\n  - Assinantes: de "${oldAssignerNames}" para "${newAssignerNames}"`;
                        existingTaskByProject.assinantes = assignersIds;
                        changed = true;
                    }

                    // Verifica e atualiza a descrição do projeto
                    if (regexNPrefix.test(task.subject)) {
                        // Se o modelo de negociação estiver presente
                        if (existingTaskByProject.descricao !== fullDescription) {
                            // Atualiza a descrição completa e mostra apenas o modelo de negociação no log
                            changeDetails += `\n  - Descrição: de "${existingTaskByProject.descricao}" para "${description}"`;
                            existingTaskByProject.descricao = fullDescription;
                            changed = true;
                        }
                    } else {
                        // Se o modelo de negociação não estiver presente
                        if (existingTaskByProject.descricao !== fullDescription) {
                            // Atualiza a descrição completa e mostra a mensagem padrão no log
                            changeDetails += `\n  - Descrição: de "${existingTaskByProject.descricao}" para "essa tarefa não tem modelo de negociação"`;
                            existingTaskByProject.descricao = fullDescription;
                            changed = true;
                        }
                    }

                    // Se houver alterações, atualiza o projeto no Parse
                    if (changed) {
                        const projectToUpdate = new Parse.Query(Parse.Object.extend('projeto'));
                        const projectObject = await projectToUpdate.get(existingTaskByProject.id);

                        projectObject.set('status', existingTaskByProject.status);
                        projectObject.set('sprint', existingTaskByProject.sprint);
                        projectObject.set('assinantes', assignersIds);
                        projectObject.set('descricao', existingTaskByProject.descricao);
                        tasksBatch.push(projectObject.save()); // Adiciona a promessa de salvamento ao array
                        changesLog.push(changeDetails); // Registra as alterações no log de mudanças
                    }
                } else {
                    // Se a tarefa relacionada ao projeto não existir, cria um novo no Parse
                    const TaskByProjectClass = Parse.Object.extend('projeto');
                    const newTaskByProject = new TaskByProjectClass();

                    newTaskByProject.set('titulo', task.subject);
                    newTaskByProject.set('status', statusMap[task.status]);
                    newTaskByProject.set('sprint', sprintName);
                    newTaskByProject.set('assinantes', assignersIds);
                    newTaskByProject.set('descricao', fullDescription); // Salva a descrição completa no banco de dados
                    tasksBatch.push(newTaskByProject.save()); // Adiciona a promessa de salvamento ao array

                    const newAssignerNames = convertAssignerIdsToNames(assignersIds, storedUsers);
                    changesLog.push(`Novo projeto adicionado: ${task.subject}\n  - Assinantes: ${newAssignerNames}\n  - Descrição: ${description}`); // Registra o novo projeto no log de mudanças
                }
            }

            await Promise.all(tasksBatch); // Aguarda todas as promessas de salvamento serem resolvidas
        }
    } catch (error) {
        consoleOccinho?.log(logPath, `Erro ao obter tarefas por projeto: ${error.message}`); // Registra o erro
        changesLog.push(`Erro ao obter tarefas por projeto: ${error.message}`); // Adiciona o erro ao log de mudanças
    }

    // Exibe o log de mudanças
    changesLog.forEach(change => consoleOccinho?.log(logPath, change));

    return changesLog; // Retorna o log de mudanças
}

module.exports = { addOrUpdateTaskByProjectsToBack4App }; // Exporta a função para uso externo
