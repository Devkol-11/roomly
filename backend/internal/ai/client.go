package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const mistralAPI = "https://api.mistral.ai/v1/chat/completions"

type Client struct {
	apiKey     string
	httpClient *http.Client
}

func NewClient(apiKey string) *Client {
	return &Client{
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) Enabled() bool {
	return c.apiKey != ""
}

type chatRequest struct {
	Model    string    `json:"model"`
	Messages []message `json:"messages"`
}

type message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func (c *Client) complete(ctx context.Context, model, prompt string) (string, error) {
	req := chatRequest{
		Model:    model,
		Messages: []message{{Role: "user", Content: prompt}},
	}
	body, _ := json.Marshal(req)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, mistralAPI, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("mistral API returned %s", resp.Status)
	}

	var cr chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&cr); err != nil {
		return "", err
	}
	if len(cr.Choices) == 0 {
		return "", fmt.Errorf("no choices in Mistral response")
	}
	return strings.TrimSpace(cr.Choices[0].Message.Content), nil
}

// StoredMessage is the minimal chat record kept in Redis for summarization.
type StoredMessage struct {
	SenderName string    `json:"sender_name"`
	Text       string    `json:"text"`
	Timestamp  time.Time `json:"timestamp"`
}

// Summary is the structured output of Summarize.
type Summary struct {
	TLDR        string   `json:"tldr"`
	Decisions   []string `json:"decisions"`
	ActionItems []string `json:"action_items"`
	Sentiment   string   `json:"sentiment"`
}

func (c *Client) Summarize(ctx context.Context, messages []StoredMessage) (*Summary, error) {
	if len(messages) == 0 {
		return &Summary{
			TLDR:        "No messages were exchanged in this room.",
			Decisions:   []string{},
			ActionItems: []string{},
			Sentiment:   "neutral",
		}, nil
	}

	var sb strings.Builder
	for _, m := range messages {
		sb.WriteString(fmt.Sprintf("[%s] %s: %s\n", m.Timestamp.Format("15:04"), m.SenderName, m.Text))
	}

	prompt := fmt.Sprintf(`You are a concise meeting summarizer. Analyze this chat transcript and respond with valid JSON only — no markdown fences, no extra text.

Transcript:
%s

Respond with exactly this JSON structure:
{
  "tldr": "one sentence summary of the conversation",
  "decisions": ["decision 1", "decision 2"],
  "action_items": ["action item 1"],
  "sentiment": "positive|neutral|tense|mixed"
}

If there are no decisions or action items, use empty arrays. The sentiment must be one of the four values listed.`, sb.String())

	content, err := c.complete(ctx, "mistral-large-latest", prompt)
	if err != nil {
		return nil, err
	}

	content = extractJSON(content)

	var summary Summary
	if err := json.Unmarshal([]byte(content), &summary); err != nil {
		return nil, fmt.Errorf("could not parse summary JSON: %w", err)
	}
	return &summary, nil
}

// Translate translates text into the target language (BCP 47 tag or plain English name, e.g. "French", "es").
func (c *Client) Translate(ctx context.Context, text, targetLang string) (string, error) {
	prompt := fmt.Sprintf(`Translate the following message to %s. Reply with only the translated text, nothing else — no quotes, no labels, no explanation.

Message: %s`, targetLang, text)

	return c.complete(ctx, "mistral-small-latest", prompt)
}

// extractJSON strips markdown fences if the model wrapped its JSON output.
func extractJSON(s string) string {
	s = strings.TrimSpace(s)
	if start := strings.Index(s, "{"); start > 0 {
		s = s[start:]
	}
	if end := strings.LastIndex(s, "}"); end >= 0 && end < len(s)-1 {
		s = s[:end+1]
	}
	return s
}
