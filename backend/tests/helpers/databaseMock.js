/**
 * Mock do PostgreSQL para testes unitários
 */

export const createDatabaseMock = () => {
  const mockRows = [];
  const mockQueryResults = new Map();

  const query = async (text, params) => {
    const key = `${text}_${JSON.stringify(params)}`;
    
    if (mockQueryResults.has(key)) {
      return mockQueryResults.get(key);
    }

    return {
      rows: mockRows,
      rowCount: mockRows.length,
    };
  };

  const getClient = async () => {
    return {
      query: query,
      release: () => {},
    };
  };

  const setMockQueryResult = (queryText, params, result) => {
    const key = `${queryText}_${JSON.stringify(params)}`;
    mockQueryResults.set(key, result);
  };

  const setMockRows = (rows) => {
    mockRows.length = 0;
    mockRows.push(...rows);
  };

  const clearMocks = () => {
    mockRows.length = 0;
    mockQueryResults.clear();
  };

  return {
    query,
    getClient,
    setMockQueryResult,
    setMockRows,
    clearMocks,
  };
};

