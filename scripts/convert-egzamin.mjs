import fs from 'fs';
import path from 'path';

// Parse command line arguments
const inputPath = process.argv[2] || 'egzamin.txt';
const outputPath = process.argv[3] || 'apps/fiszki/egzamin.csv';

console.log(`Reading from: ${inputPath}`);
console.log(`Writing to: ${outputPath}`);

if (!fs.existsSync(inputPath)) {
  console.error(`Error: Input file ${inputPath} does not exist.`);
  process.exit(1);
}

const content = fs.readFileSync(inputPath, 'utf8');
const lines = content.split(/\r?\n/);

const questions = [];
let currentQuestion = null;

// States: 'PROMPT', 'CHOICES'
let state = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const questionMatch = line.match(/^(\d+)\.\s+(.*)$/);
  if (questionMatch) {
    if (currentQuestion) {
      questions.push(currentQuestion);
    }
    currentQuestion = {
      id: parseInt(questionMatch[1], 10),
      prompt: questionMatch[2].trim(),
      choices: [],
      explanation: ''
    };
    state = 'PROMPT';
    continue;
  }

  const choiceMatch = line.match(/^(-?)([a-g])\.\s+(.*)$/);
  if (choiceMatch) {
    if (!currentQuestion) {
      console.warn(`Warning: Found choice before any question on line ${i + 1}: ${line}`);
      continue;
    }
    const isCorrect = choiceMatch[1] === '-';
    const choiceText = choiceMatch[3].trim();
    currentQuestion.choices.push({
      text: choiceText,
      isCorrect: isCorrect
    });
    state = 'CHOICES';
    continue;
  }

  // Not a question, not a choice
  if (currentQuestion) {
    if (state === 'PROMPT') {
      currentQuestion.prompt += ' ' + line;
    } else if (state === 'CHOICES') {
      if (currentQuestion.explanation) {
        currentQuestion.explanation += ' ' + line;
      } else {
        currentQuestion.explanation = line;
      }
    }
  } else {
    console.warn(`Warning: Orphan line outside of question context on line ${i + 1}: ${line}`);
  }
}

// Push the last question
if (currentQuestion) {
  questions.push(currentQuestion);
}

console.log(`Parsed ${questions.length} questions.`);

// Format as CSV
// The separator is (;)
const csvLines = questions.map(q => {
  let prompt = q.prompt;
  if (q.explanation) {
    prompt += ` [Note: ${q.explanation}]`;
  }
  // Sanitize to prevent breaking (;) separation or line breaks
  prompt = prompt.replace(/\(\;\)/g, ';').replace(/\r?\n/g, ' ');

  const choicesText = q.choices.map(c => {
    let text = c.text.replace(/\(\;\)/g, ';').replace(/\r?\n/g, ' ');
    if (c.isCorrect && q.choices.length > 1) {
      return `$${text}`;
    }
    return text;
  });

  return [prompt, ...choicesText].join('(;)');
});

// Ensure directory exists
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, csvLines.join('\n'), 'utf8');
console.log(`Successfully wrote CSV file to: ${outputPath} with ${csvLines.length} lines.`);
